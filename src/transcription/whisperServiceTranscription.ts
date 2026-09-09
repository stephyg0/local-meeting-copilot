import type { TranscriptListener, TranscriptionProvider } from "./types";

export type ServiceStatusListener = (message: string, kind?: "status" | "error") => void;

export class WhisperServiceTranscriptionProvider implements TranscriptionProvider {
  readonly id = "whisper-service";
  readonly label = "Transcription";
  private socket: WebSocket | null = null;
  private children: WhisperServiceTranscriptionProvider[] = [];
  private cancelStart: (() => void) | null = null;

  constructor(private readonly serviceUrl = "ws://127.0.0.1:8765/transcribe") {}

  async start(listener: TranscriptListener, statusListener?: ServiceStatusListener, audioSource = "microphone"): Promise<void> {
    if (audioSource === "both") {
      await this.stop();
      const inputs = ["microphone", "system"];
      const children = inputs.map(() => new WhisperServiceTranscriptionProvider(this.serviceUrl));
      this.children = children;
      const status: ServiceStatusListener = (message, kind) => {
        if (kind === "error") void this.stop();
        statusListener?.(message, kind);
      };
      try {
        await Promise.all(children.map((child, index) => child.start(segment => listener({
          ...segment,
          text: `[${index === 0 ? "Microphone" : "Call"}] ${segment.text}`
        }), status, inputs[index])));
      } catch (error) {
        await this.stop();
        throw error;
      }
      return;
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.socket = new WebSocket(this.serviceUrl);

    await new Promise<void>((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Could not create transcription connection."));
        return;
      }

      const timeout = window.setTimeout(() => {
        this.socket?.close();
        this.socket = null;
        reject(new Error(`Timed out connecting to ${this.serviceUrl}.`));
      }, 15000);
      this.cancelStart = () => {
        window.clearTimeout(timeout);
        reject(new Error("Transcription stopped."));
      };

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
          if (message.message === "microphone open" || message.message === "system audio open") {
            window.clearTimeout(timeout);
            resolve();
          }
          statusListener?.(message.message);
        }

        if (message.type === "error") {
          window.clearTimeout(timeout);
          reject(new Error(message.message || "Transcription failed."));
          statusListener?.(message.message || "Transcription failed.", "error");
          this.socket?.close();
          this.socket = null;
        }
      };

      this.socket.onopen = () => {
        this.socket?.send(JSON.stringify({ type: "start", audio_source: audioSource }));
      };

      this.socket.onclose = () => {
        window.clearTimeout(timeout);
        this.socket = null;
        const message = "Transcription disconnected. Press Start to reconnect.";
        statusListener?.(message, "error");
        reject(new Error(message));
      };

      this.socket.onerror = () => {
        window.clearTimeout(timeout);
        const message = `Transcription is not reachable at ${this.serviceUrl}.`;
        reject(new Error(message));
        statusListener?.(message, "error");
        void this.stop();
      };
    });
  }

  async stop(): Promise<void> {
    const children = this.children;
    this.children = [];
    this.cancelStart?.();
    this.cancelStart = null;
    if (this.socket) this.socket.onclose = null;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "stop" }));
    }
    this.socket?.close();
    this.socket = null;
    await Promise.all(children.map(child => child.stop()));
  }
}
