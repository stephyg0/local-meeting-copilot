import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AssistantRegistry } from "../assistant/providerRegistry";
import type { AssistantResponse } from "../assistant/types";
import type { TranscriptSegment, TranscriptionProvider } from "../transcription/types";
import { WhisperServiceTranscriptionProvider } from "../transcription/whisperServiceTranscription";

type StatusKind = "idle" | "recording" | "error" | "working";

interface Status {
  kind: StatusKind;
  message: string;
}

type QueueStatus = "queued" | "running" | "done" | "error";

interface AssistantQueueItem {
  id: string;
  question: string;
  transcript: string;
  screenshotDataUrl?: string;
  createdAt: Date;
  status: QueueStatus;
  response?: AssistantResponse;
  error?: string;
}

export function App() {
  const assistantRegistry = useMemo(() => new AssistantRegistry(), []);
  const whisperProvider = useMemo<TranscriptionProvider>(() => new WhisperServiceTranscriptionProvider(), []);
  const activeTranscriptionProvider = useRef<TranscriptionProvider | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "Ready. Start uses local Whisper if the service is running." });
  const [screenCapture, setScreenCapture] = useState<ScreenCaptureResult | null>(null);
  const [assistantResponse, setAssistantResponse] = useState<AssistantResponse | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [providerLabel, setProviderLabel] = useState(whisperProvider.label);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [assistantQueue, setAssistantQueue] = useState<AssistantQueueItem[]>([]);
  const isProcessingQueue = useRef(false);

  const transcript = segments.map((segment) => segment.text).join("\n");
  const queuedCount = assistantQueue.filter((item) => item.status === "queued").length;

  useEffect(() => {
    void processAssistantQueue();
  }, [assistantQueue, isAsking]);

  async function startTranscription() {
    const handleSegment = (segment: TranscriptSegment) => {
      setSegments((current) => [...current, segment]);
    };

    try {
      setStatus({ kind: "working", message: "Connecting to local Whisper service..." });
      if (whisperProvider instanceof WhisperServiceTranscriptionProvider) {
        await whisperProvider.start(handleSegment, (message, kind = "status") => {
          setStatus({
            kind: kind === "error" ? "error" : "recording",
            message: `Whisper service: ${message}.`
          });
        });
      } else {
        await whisperProvider.start(handleSegment);
      }
      activeTranscriptionProvider.current = whisperProvider;
      setProviderLabel(whisperProvider.label);
      setIsRecording(true);
      setIsExpanded(true);
      setStatus({ kind: "recording", message: "Listening with local Whisper." });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Start the local Whisper service for real transcription."
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

  function queueAssistantAsk(event?: FormEvent) {
    event?.preventDefault();
    const question = assistantDraft.trim() || "Help me with this meeting.";
    const item: AssistantQueueItem = {
      id: crypto.randomUUID(),
      question,
      transcript,
      screenshotDataUrl: screenCapture?.dataUrl,
      createdAt: new Date(),
      status: "queued"
    };
    setAssistantDraft("");
    setIsExpanded(true);
    setAssistantQueue((current) => [...current, item]);
    setStatus({ kind: isRecording ? "recording" : "idle", message: `Queued: ${question}` });
  }

  async function processAssistantQueue() {
    if (isProcessingQueue.current) {
      return;
    }

    const next = assistantQueue.find((item) => item.status === "queued");
    if (!next) {
      return;
    }

    isProcessingQueue.current = true;
    setIsAsking(true);
    setAssistantResponse(null);
    setStatus({ kind: "working", message: `Asking: ${next.question}` });
    setAssistantQueue((current) => current.map((item) => (
      item.id === next.id ? { ...item, status: "running" } : item
    )));

    try {
      const response = await assistantRegistry.askWithFallback({
        transcript: next.transcript,
        question: next.question,
        screenshotDataUrl: next.screenshotDataUrl
      });
      setAssistantResponse(response);
      setIsExpanded(true);
      setAssistantQueue((current) => current.map((item) => (
        item.id === next.id ? { ...item, status: "done", response } : item
      )));
      setStatus({ kind: isRecording ? "recording" : "idle", message: `Assistant response from ${response.provider}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assistant backend failed.";
      setAssistantQueue((current) => current.map((item) => (
        item.id === next.id ? { ...item, status: "error", error: message } : item
      )));
      setStatus({
        kind: "error",
        message
      });
    } finally {
      setIsAsking(false);
      isProcessingQueue.current = false;
    }
  }

  function clearTranscript() {
    setSegments([]);
    setAssistantResponse(null);
  }

  function clearQueue() {
    setAssistantQueue([]);
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
        <button onClick={() => queueAssistantAsk()}>
          {isAsking || queuedCount > 0 ? `Queue ${queuedCount}` : "Ask"}
        </button>
      </section>

      {isExpanded && (
        <section className="expanded-panel">
          <form className="ask-box" onSubmit={queueAssistantAsk}>
            <textarea
              value={assistantDraft}
              onChange={(event) => setAssistantDraft(event.target.value)}
              placeholder="Ask about what was just said..."
              rows={3}
            />
            <button type="submit" className="primary">
              {isAsking ? "Add to Queue" : "Queue Ask"}
            </button>
          </form>

          <section className="secondary-actions">
            <button onClick={captureScreenContext}>Screenshot</button>
            <button className="ghost" onClick={clearTranscript}>Clear Transcript</button>
          </section>

          <section className="privacy-strip">
            <span>Mic starts only after Start.</span>
            <span>Screenshots happen only when clicked.</span>
            <span>Assistant asks use Ollama first, mock answer fallback.</span>
            <span>Asks run one at a time; you can queue more while one runs.</span>
          </section>

          {assistantQueue.length > 0 && (
            <section className="assistant-queue">
              <div className="section-heading">
                <h2>Ask Queue</h2>
                <button className="text-button" onClick={clearQueue}>Clear</button>
              </div>
              <div className="queue-log">
                {assistantQueue.map((item) => (
                  <article key={item.id} className={`queue-item ${item.status}`}>
                    <div>
                      <strong>{item.question}</strong>
                      <span>{item.status} · {item.createdAt.toLocaleTimeString()}</span>
                    </div>
                    {item.response && <p>{item.response.text}</p>}
                    {item.error && <p>{item.error}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

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
                <p className="empty">Press Start to begin real local transcription.</p>
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
