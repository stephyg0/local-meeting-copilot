import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { WhisperServiceTranscriptionProvider } from "../transcription/whisperServiceTranscription";
import type { TranscriptSegment } from "../transcription/types";

export function App() {
  const provider = useMemo(() => new WhisperServiceTranscriptionProvider(), []);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [source, setSource] = useState("microphone");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const captureGeneration = useRef(0);
  const transcript = segments.map(segment => segment.text).join("\n");
  const bridge = window.meetingCopilot;

  function report(text: string, failed = false) { setMessage(text); setError(failed); }

  useEffect(() => () => { void provider.stop(); }, [provider]);

  useLayoutEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    void (async () => {
      await bridge?.resizeWindow(expanded, false);
      if (cancelled || !expanded || !content.current) return;
      const measure = () => {
        if (!cancelled && content.current) void bridge?.resizeWindowToContent(Math.ceil(content.current.getBoundingClientRect().height) + 26);
      };
      observer = new ResizeObserver(measure);
      observer.observe(content.current);
      measure();
    })();
    return () => { cancelled = true; observer?.disconnect(); };
  }, [expanded]);

  async function start() {
    if (starting || recording) return;
    setStarting(true);
    const generation = ++captureGeneration.current;
    report("Starting audio...");
    try {
      await bridge?.ensureTranscription();
      if (generation !== captureGeneration.current) return;
      await provider.start(segment => setSegments(current => {
        const index = current.findIndex(item => item.id === segment.id);
        if (!segment.text) return current.filter(item => item.id !== segment.id);
        if (index < 0) return [...current, segment];
        return current.map((item, position) => position === index ? { ...segment, timestamp: item.timestamp } : item);
      }), (text, kind) => {
        if (kind === "error") { setRecording(false); report(text, true); }
      }, source);
      if (generation !== captureGeneration.current) { await provider.stop(); return; }
      setRecording(true);
      report("");
    } catch (failure) { if (generation === captureGeneration.current) report(String(failure instanceof Error ? failure.message : failure), true); }
    finally { setStarting(false); }
  }

  async function stop() { captureGeneration.current++; await provider.stop(); setRecording(false); report(""); }

  async function ask() {
    if (asking) return;
    setAsking(true);
    const snapshotTranscript = transcript;
    report("Capturing screen and sending to ChatGPT...");
    try {
      if (!bridge) throw new Error("Desktop connection unavailable. Relaunch Bulby.");
      const screenshot = await bridge.captureScreen();
      await bridge.askBrowser(snapshotTranscript, screenshot.dataUrl);
      report("Sent to ChatGPT.");
    } catch (failure) { report(failure instanceof Error ? failure.message : String(failure), true); }
    finally { setAsking(false); }
  }

  async function pair() {
    try {
      if (!bridge) throw new Error("Open the Bulby desktop application.");
      await bridge.pairBrowser();
      report("Pairing code copied. Paste it into the Bulby extension on your ChatGPT tab.");
    } catch (failure) { report(String(failure), true); }
  }

  async function copy() {
    try { if (bridge) await bridge.copyText(transcript); else await navigator.clipboard.writeText(transcript); report("Transcript copied."); }
    catch { report("Could not copy the transcript.", true); }
  }

  async function close() { await stop(); await bridge?.closeWindow(); }

  function beginResize(event: React.PointerEvent<HTMLDivElement>, edge: "bottom-left" | "bottom-center" | "bottom-right") {
    event.currentTarget.setPointerCapture(event.pointerId);
    void bridge?.resizeWindowStart(edge, event.screenX, event.screenY);
  }
  function moveResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) void bridge?.resizeWindowMove(event.screenX, event.screenY);
  }
  function endResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    void bridge?.resizeWindowEnd();
  }

  return <main className={`pet-shell ${expanded ? "expanded" : "compact"}`}>
    <div ref={content} className="shell-content">
      <header className="drag-region pet-head">
        <button className={`pet-face ${recording ? "active" : ""}`} aria-label={expanded ? "Collapse copilot" : "Expand copilot"} onClick={() => { setExpanded(!expanded); setShowTranscript(false); }}>
          <span className="pet-eye" /><span className="pet-eye" />
        </button>
        <div className="pet-title"><strong>{recording ? (source === "both" ? "recording mic + call" : source === "system" ? "recording call audio" : "recording microphone") : "ready"}</strong></div>
        <div className="audio-bars" aria-label={recording ? "Recording" : "Idle"}>{[0,1,2,3,4].map(i => <span key={i} />)}</div>
        <button className="close-button" onClick={() => void close()} aria-label="Close copilot">×</button>
      </header>
      {expanded && <>
        <div className="audio-source" role="group" aria-label="Audio source">
          <button aria-pressed={source === "microphone"} disabled={recording || starting} onClick={() => setSource("microphone")}>Microphone</button>
          <button aria-pressed={source === "system"} disabled={recording || starting} onClick={() => setSource("system")}>Call audio</button>
          <button aria-pressed={source === "both"} disabled={recording || starting} onClick={() => setSource("both")}>Both</button>
          <button className="browser-connect" onClick={() => void pair()}>Connect Chrome</button>
        </div>
        <section className="pet-actions">
          <button className={recording ? "danger" : "primary"} disabled={starting} onClick={() => void (recording ? stop() : start())}>{starting ? "Starting..." : recording ? "Stop" : "Start"}</button>
          <button disabled={asking} onClick={() => void ask()} title="Send current screen and transcript to your paired ChatGPT tab">{asking ? "Sending..." : "Ask"}</button>
        </section>
        {message && <div role={error ? "alert" : "status"} className={`status ${error ? "error" : ""}`}>{message}</div>}
        <section className="transcript">
          <div className="section-heading">
            <button className="transcript-toggle" aria-expanded={showTranscript} aria-label={showTranscript ? "Hide transcript" : "Show transcript"} onClick={() => setShowTranscript(!showTranscript)}>
              <h2>Transcript</h2><span className={`transcript-chevron ${showTranscript ? "down" : "up"}`} aria-hidden="true" />
            </button>
            <div className="transcript-tools">
              <button className="icon-button" aria-label="Copy transcript" title="Copy transcript" disabled={!transcript} onClick={() => void copy()}>⧉</button>
              <button className="text-button" disabled={!transcript} onClick={() => setSegments([])}>Clear</button>
            </div>
          </div>
          {showTranscript && <div className="transcript-log" aria-live="polite">{segments.length ? segments.map(segment => <article key={segment.id}><p>{segment.text}{segment.isFinal === false && <small aria-label="Provisional transcript"> (draft)</small>}</p></article>) : <p className="empty">{recording ? "Waiting for speech..." : "No transcript yet."}</p>}</div>}
        </section>
      </>}
    </div>
    {expanded && bridge && (["bottom-left", "bottom-center", "bottom-right"] as const).map(edge => <div key={edge} className={`resize-handle ${edge}`} onPointerDown={event => beginResize(event, edge)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} />)}
  </main>;
}
