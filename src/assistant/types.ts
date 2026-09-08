export interface AssistantRequest {
  transcript: string;
  screenshotDataUrl?: string;
}

export interface AssistantResponse {
  provider: string;
  text: string;
}

export interface AssistantProvider {
  readonly id: string;
  readonly label: string;
  ask(request: AssistantRequest): Promise<AssistantResponse>;
}
