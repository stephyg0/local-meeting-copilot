import type { AssistantProvider, AssistantRequest, AssistantResponse } from "./types";

export class MockAssistantProvider implements AssistantProvider {
  readonly id = "mock";
  readonly label = "Mock assistant";

  async ask(request: AssistantRequest): Promise<AssistantResponse> {
    const words = request.transcript.trim().split(/\s+/).filter(Boolean).length;
    const screenshotNote = request.screenshotDataUrl
      ? "I also received the latest screenshot context."
      : "No screenshot context was attached.";

    return {
      provider: this.label,
      text: [
        "Demo response:",
        `I see ${words} transcript words so far.`,
        screenshotNote,
        "Once Ollama is running, this same button will use your local model."
      ].join(" ")
    };
  }
}
