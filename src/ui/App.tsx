import { useMemo, useRef, useState } from "react";
import { AssistantRegistry } from "../assistant/providerRegistry";
import type { AssistantResponse } from "../assistant/types";
import { MockTranscriptionProvider } from "../transcription/mockTranscription";
import type { TranscriptSegment, TranscriptionProvider } from "../transcription/types";
import { WhisperServiceTranscriptionProvider } from "../transcription/whisperServiceTranscription";

type StatusKind = "idle" | "recording" | "error" | "working";

interface Status {
  kind: StatusKind;
  message: string;
}

export function App() {
  const assistantRegistry = useMemo(() => new AssistantRegistry(), []);
  const whisperProvider = useMemo<TranscriptionProvider>(() => new WhisperServiceTranscriptionProvider(), []);
  const mockProvider = useMemo<TranscriptionProvider>(() => new MockTranscriptionProvider(), []);
  const activeTranscriptionProvider = useRef<TranscriptionProvider | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "Ready. Start uses local Whisper if the service is running." });
  const [screenCapture, setScreenCapture] = useState<ScreenCaptureResult | null>(null);
  const [assistantResponse, setAssistantResponse] = useState<AssistantResponse | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [providerLabel, setProviderLabel] = useState(whisperProvider.label);

  const transcript = segments.map((segment) => segment.text).join("\n");

  async function startTranscription() {
    const handleSegment = (segment: TranscriptSegment) => {
      setSegments((current) => [...current, segment]);
    };

    try {
      setStatus({ kind: "working", message: "Connecting to local Whisper service..." });
      await whisperProvider.start(handleSegment);
      activeTranscriptionProvider.current = whisperProvider;
      setProviderLabel(whisperProvider.label);
      setIsRecording(true);
      setIsExpanded(true);
      setStatus({ kind: "recording", message: "Listening with local Whisper." });
    } catch (error) {
      await mockProvider.start(handleSegment);
      activeTranscriptionProvider.current = mockProvider;
      setProviderLabel(mockProvider.label);
      setIsRecording(true);
      setIsExpanded(true);
      setStatus({
        kind: "error",
        message: `Whisper is not running, so demo transcription is active. ${
          error instanceof Error ? error.message : "Start the local service for real transcription."
        }`
      });
    }
  }

  async function stopTranscription() {
    await activeTranscriptionProvider.current?.stop();
    activeTranscriptionProvider.current = null;
    setIsRecording(false);
    setStatus({ kind: "idle", message: "Recording stopped." });
  }

  async function captureScreenContext() {
    try {
      setStatus({ kind: "working", message: "Capturing screen by explicit request..." });
      if (!window.meetingCopilot?.captureScreen) {
        throw new Error("Screen capture is available only inside the desktop app.");
      }
      const result = await window.meetingCopilot.captureScreen();
      setScreenCapture(result);
      setStatus({ kind: isRecording ? "recording" : "idle", message: `Screen context captured from ${result.name}.` });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Screen capture permission was denied or unavailable."
      });
    }
  }

  async function askAssistant() {
    setIsAsking(true);
    setAssistantResponse(null);
    setStatus({ kind: "working", message: "Asking local assistant backend..." });
    try {
      const response = await assistantRegistry.askWithFallback({
        transcript,
        screenshotDataUrl: screenCapture?.dataUrl
      });
      setAssistantResponse(response);
      setIsExpanded(true);
      setStatus({ kind: isRecording ? "recording" : "idle", message: `Assistant response from ${response.provider}.` });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Assistant backend failed."
      });
    } finally {
      setIsAsking(false);
    }
  }

  function clearTranscript() {
    setSegments([]);
    setAssistantResponse(null);
  }

  return (
    <main className={`pet-shell ${isExpanded ? "expanded" : "compact"}`}>
      <header className="drag-region pet-head">
        <button
          className={`pet-face ${isRecording ? "active" : ""}`}
          onClick={() => setIsExpanded((current) => !current)}
          aria-label={isExpanded ? "Collapse copilot" : "Expand copilot"}
        >
          <span className="pet-eye" />
          <span className="pet-eye" />
        </button>
        <div className="pet-title">
          <p>Local copilot</p>
          <strong>{isRecording ? "listening" : "ready"}</strong>
        </div>
        <div className={`recording-dot ${isRecording ? "active" : ""}`} aria-label={isRecording ? "Recording" : "Idle"} />
      </header>

      <section className={`status ${status.kind}`}>
        <span>{status.message}</span>
      </section>

      <section className="pet-actions">
        {!isRecording ? (
          <button className="primary" onClick={startTranscription}>Start</button>
        ) : (
          <button className="danger" onClick={stopTranscription}>Stop</button>
        )}
        <button onClick={askAssistant} disabled={isAsking}>
          {isAsking ? "Asking" : "Ask"}
        </button>
      </section>

      {isExpanded && (
        <section className="expanded-panel">
          <section className="secondary-actions">
            <button onClick={captureScreenContext}>Screenshot</button>
            <button className="ghost" onClick={clearTranscript}>Clear</button>
          </section>

          <section className="privacy-strip">
            <span>Mic starts only after Start.</span>
            <span>Screenshots happen only when clicked.</span>
            <span>Ollama first, demo fallback.</span>
          </section>

          {screenCapture && (
            <section className="screenshot-preview">
              <div>
                <strong>Screen context</strong>
                <span>{screenCapture.name}</span>
              </div>
              <img src={screenCapture.dataUrl} alt="Latest user-captured screen context" />
            </section>
          )}

          <section className="transcript">
            <div className="section-heading">
              <h2>Transcript</h2>
              <span>{providerLabel}</span>
            </div>
            <div className="transcript-log">
              {segments.length === 0 ? (
                <p className="empty">Press Start to begin the demo transcript.</p>
              ) : (
                segments.map((segment) => (
                  <article key={segment.id}>
                    <time>{segment.timestamp.toLocaleTimeString()}</time>
                    <p>{segment.text}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          {assistantResponse && (
            <section className="assistant-response">
              <div className="section-heading">
                <h2>Assistant</h2>
                <span>{assistantResponse.provider}</span>
              </div>
              <p>{assistantResponse.text}</p>
            </section>
          )}
        </section>
      )}
    </main>
  );
}
