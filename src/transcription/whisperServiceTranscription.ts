import type { TranscriptListener, TranscriptionProvider } from "./types";

export type ServiceStatusListener = (message: string, kind?: "status" | "error") => void;

export class WhisperServiceTranscriptionProvider implements TranscriptionProvider {
  readonly id = "whisper-service";
  readonly label = "Local Whisper service";
  private socket: WebSocket | null = null;

  constructor(private readonly serviceUrl = "ws://127.0.0.1:8765/transcribe") {}

  async start(listener: TranscriptListener, statusListener?: ServiceStatusListener): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.socket = new WebSocket(this.serviceUrl);

    await new Promise<void>((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Could not create Whisper service connection."));
        return;
      }

      const timeout = window.setTimeout(() => {
        reject(new Error(`Timed out connecting to ${this.serviceUrl}.`));
      }, 2500);

      this.socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as {
          type: "segment" | "error" | "status";
          text?: string;
          message?: string;
        };

        if (message.type === "segment" && message.text?.trim()) {
          listener({
            id: crypto.randomUUID(),
            text: message.text.trim(),
            timestamp: new Date(),
            source: "whisper"
          });
        }

        if (message.type === "status" && message.message) {
          statusListener?.(message.message);
        }

        if (message.type === "error") {
          statusListener?.(message.message || "Local Whisper service failed.", "error");
          this.socket?.close();
          this.socket = null;
        }
      };

      this.socket.onopen = () => {
        window.clearTimeout(timeout);
        this.socket?.send(JSON.stringify({ type: "start" }));
        resolve();
      };

      this.socket.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error(`Local Whisper service is not reachable at ${this.serviceUrl}.`));
      };
    });
  }

  async stop(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "stop" }));
    }
    this.socket?.close();
    this.socket = null;
  }
}
