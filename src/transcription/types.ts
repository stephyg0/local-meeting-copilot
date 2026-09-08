export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: Date;
  source: "mock" | "whisper";
}

export type TranscriptListener = (segment: TranscriptSegment) => void;

export interface TranscriptionProvider {
  readonly id: string;
  readonly label: string;
  start(listener: TranscriptListener): Promise<void>;
  stop(): Promise<void>;
}
