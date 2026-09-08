import type { AssistantProvider, AssistantRequest, AssistantResponse } from "./types";
import { MockAssistantProvider } from "./mockAssistant";
import { OllamaAssistantProvider } from "./ollamaAssistant";

export class AssistantRegistry {
  private readonly mock = new MockAssistantProvider();
  private readonly providers: AssistantProvider[] = [
    new OllamaAssistantProvider(),
    this.mock
  ];

  get availableProviders() {
    return this.providers.map((provider) => ({
      id: provider.id,
      label: provider.label
    }));
  }

  async askWithFallback(request: AssistantRequest): Promise<AssistantResponse> {
    const [primary, fallback] = this.providers;
    try {
      return await primary.ask(request);
    } catch (error) {
      const fallbackResponse = await fallback.ask(request);
      return {
        provider: fallbackResponse.provider,
        text: [
          "Ollama is not reachable, so the app used demo mode.",
          error instanceof Error ? `(${error.message})` : "",
          fallbackResponse.text
        ].filter(Boolean).join(" ")
      };
    }
  }
}
