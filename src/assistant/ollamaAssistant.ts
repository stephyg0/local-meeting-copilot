import type { AssistantProvider, AssistantRequest, AssistantResponse } from "./types";

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

export class OllamaAssistantProvider implements AssistantProvider {
  readonly id = "ollama";
  readonly label = "Ollama";

  constructor(
    private readonly endpoint = "http://127.0.0.1:11434",
    private readonly model = "llama3.2"
  ) {}

  async ask(request: AssistantRequest): Promise<AssistantResponse> {
    const prompt = [
      "You are a local meeting copilot. Be concise, practical, and privacy-preserving.",
      "Use only the transcript and optional screen context summary supplied by the user action.",
      "",
      "Transcript so far:",
      request.transcript || "(No transcript yet.)",
      "",
      "User question:",
      request.question || "Help me with this meeting.",
      "",
      request.screenshotDataUrl
        ? "A screenshot was attached by explicit user action. The current MVP sends only a presence signal; multimodal model support can be added behind this provider."
        : "No screenshot was attached."
    ].join("\n");

    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}.`);
    }

    const data = (await response.json()) as OllamaGenerateResponse;
    if (data.error) {
      throw new Error(data.error);
    }

    return {
      provider: `${this.label} (${this.model})`,
      text: data.response?.trim() || "Ollama returned an empty response."
    };
  }
}
