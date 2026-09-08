import type { TranscriptListener, TranscriptionProvider } from "./types";

const DEMO_LINES = [
  "Let's recap the user problem before we jump into the implementation.",
  "The default flow should stay local and should not need paid cloud API credits.",
  "Screen context needs to be user initiated and visibly attached.",
  "We should keep the provider boundary clean so OpenAI API support can be added later.",
  "The next useful step is turning this into a small end-to-end desktop overlay."
];

export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly id = "mock";
  readonly label = "Mock transcript stream";
  private timer: number | undefined;
  private index = 0;

  async start(listener: TranscriptListener): Promise<void> {
    this.stopTimer();
    this.index = 0;
    this.timer = window.setInterval(() => {
      listener({
        id: crypto.randomUUID(),
        text: DEMO_LINES[this.index % DEMO_LINES.length],
        timestamp: new Date(),
        source: "mock"
      });
      this.index += 1;
    }, 1800);
  }

  async stop(): Promise<void> {
    this.stopTimer();
  }

  private stopTimer() {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
