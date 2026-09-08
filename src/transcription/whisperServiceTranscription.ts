import type { TranscriptListener, TranscriptionProvider } from "./types";

export class WhisperServiceTranscriptionProvider implements TranscriptionProvider {
  readonly id = "whisper-service";
  readonly label = "Local Whisper service";

  constructor(private readonly serviceUrl = "ws://127.0.0.1:8765/transcribe") {}

  async start(_listener: TranscriptListener): Promise<void> {
    throw new Error(
      `Whisper service mode is scaffolded at ${this.serviceUrl}; run the mock mode now, then connect the local faster-whisper service described in the README.`
    );
  }

  async stop(): Promise<void> {
    return;
  }
}
