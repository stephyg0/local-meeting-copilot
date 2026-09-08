import { useMemo, useRef, useState } from "react";
import { AssistantRegistry } from "../assistant/providerRegistry";
import type { AssistantResponse } from "../assistant/types";
import { requestMicrophonePermission } from "../transcription/audioPermissions";
import { MockTranscriptionProvider } from "../transcription/mockTranscription";
import type { TranscriptSegment, TranscriptionProvider } from "../transcription/types";

type StatusKind = "idle" | "recording" | "error" | "working";

interface Status {
  kind: StatusKind;
  message: string;
}

export function App() {
  const assistantRegistry = useMemo(() => new AssistantRegistry(), []);
  const transcriptionProvider = useMemo<TranscriptionProvider>(() => new MockTranscriptionProvider(), []);
  const microphoneStream = useRef<MediaStream | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "Local demo mode ready." });
  const [screenCapture, setScreenCapture] = useState<ScreenCaptureResult | null>(null);
  const [assistantResponse, setAssistantResponse] = useState<AssistantResponse | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const transcript = segments.map((segment) => segment.text).join("\n");

  async function startTranscription() {
    try {
      setStatus({ kind: "working", message: "Requesting microphone permission..." });
      microphoneStream.current = await requestMicrophonePermission();
      await transcriptionProvider.start((segment) => {
        setSegments((current) => [...current, segment]);
      });
      setIsRecording(true);
      setStatus({ kind: "recording", message: "Recording is active. Mock transcription is streaming." });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Microphone permission or capture failed."
      });
      stopMicrophoneTracks();
    }
  }

  async function stopTranscription() {
    await transcriptionProvider.stop();
    stopMicrophoneTracks();
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

  function stopMicrophoneTracks() {
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
    microphoneStream.current = null;
  }

  return (
    <main className="overlay">
      <header className="drag-region titlebar">
        <div>
          <p className="eyebrow">Local-first meeting copilot</p>
          <h1>Overlay MVP</h1>
        </div>
        <div className={`recording-pill ${isRecording ? "active" : ""}`}>
          <span />
          {isRecording ? "Recording" : "Idle"}
        </div>
      </header>

      <section className={`status ${status.kind}`}>
        <strong>{status.kind === "error" ? "Needs attention" : "Status"}</strong>
        <span>{status.message}</span>
      </section>

      <section className="controls">
        {!isRecording ? (
          <button className="primary" onClick={startTranscription}>Start</button>
        ) : (
          <button className="danger" onClick={stopTranscription}>Stop</button>
        )}
        <button onClick={captureScreenContext}>Capture Screen Context</button>
        <button onClick={askAssistant} disabled={isAsking}>
          {isAsking ? "Asking..." : "Ask Assistant"}
        </button>
        <button className="ghost" onClick={clearTranscript}>Clear</button>
      </section>

      <section className="privacy-strip">
        <span>Mic capture only starts after Start.</span>
        <span>Screenshot capture only runs when clicked.</span>
        <span>Default assistant target is local Ollama, with mock fallback.</span>
      </section>

      {screenCapture && (
        <section className="screenshot-preview">
          <div>
            <strong>Latest screen context</strong>
            <span>{screenCapture.name}</span>
          </div>
          <img src={screenCapture.dataUrl} alt="Latest user-captured screen context" />
        </section>
      )}

      <section className="transcript">
        <div className="section-heading">
          <h2>Transcript</h2>
          <span>{transcriptionProvider.label}</span>
        </div>
        <div className="transcript-log">
          {segments.length === 0 ? (
            <p className="empty">Press Start to request microphone access and stream the demo transcript.</p>
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
    </main>
  );
}
