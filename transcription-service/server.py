import argparse
import asyncio
import json
import os
import queue
import re
import threading
from dataclasses import dataclass, replace
from typing import Optional

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
from websockets.server import serve
from streaming import StreamingWindow
import time


SAMPLE_RATE = 16000
CHANNELS = 1


def clean_repeated_text(text: str) -> str:
    """Remove decoder loops such as the same sentence repeated many times."""
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text.strip()) if part.strip()]
    cleaned_sentences: list[str] = []
    for sentence in sentences:
        if cleaned_sentences and sentence.casefold() == cleaned_sentences[-1].casefold():
            continue
        cleaned_sentences.append(sentence)

    words = " ".join(cleaned_sentences).split()
    for size in range(min(12, len(words) // 3), 0, -1):
        repetitions = 0
        first = words[:size]
        for offset in range(0, len(words) - size + 1, size):
            if words[offset:offset + size] != first:
                break
            repetitions += 1
        if repetitions >= 3:
            words = first
            break

    return " ".join(words).strip()


@dataclass
class TranscriptionConfig:
    model: str
    device: str
    compute_type: str
    chunk_seconds: float
    input_device: Optional[int]
    audio_source: str


class MicrophoneWhisperSession:
    def __init__(
        self,
        websocket,
        config: TranscriptionConfig,
        loop: asyncio.AbstractEventLoop,
        model: WhisperModel,
    ):
        self.websocket = websocket
        self.config = config
        self.loop = loop
        self.audio_queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=300)
        self.stop_event = threading.Event()
        self.model = model
        self.stream: sd.InputStream | None = None

    async def start(self):
        await self.send_status("opening system audio" if self.config.audio_source == "system" else "opening microphone")
        worker = threading.Thread(target=self._record_and_transcribe, daemon=True)
        worker.start()

        while not self.stop_event.is_set():
            await asyncio.sleep(0.1)

    async def stop(self):
        self.stop_event.set()

    async def send_status(self, message: str):
        await self.websocket.send(json.dumps({"type": "status", "message": message}))

    def _record_and_transcribe(self):
        window = StreamingWindow(SAMPLE_RATE)

        def callback(indata, frames, _time, status):
            if status:
                self._send_from_thread({"type": "status", "message": f"audio warning: {status}"})
            try:
                self.audio_queue.put_nowait(indata.mean(axis=1).copy())
            except queue.Full:
                self._send_from_thread({"type": "error", "message": "Transcription cannot keep up with audio. Stop and restart with a smaller model."})
                self.stop_event.set()

        try:
            input_device = self.config.input_device
            if input_device is None:
                devices = sd.query_devices()
                if self.config.audio_source == "system":
                    preferred_names = ("BlackHole", "Loopback", "Soundflower", "CABLE Output")
                    input_device = next(
                        (
                            index
                            for index, device in enumerate(devices)
                            if device.get("max_input_channels", 0) > 0
                            and any(name.casefold() in device.get("name", "").casefold() for name in preferred_names)
                        ),
                        None,
                    )
                    if input_device is None:
                        raise RuntimeError(
                            "No system-audio input was found. Install BlackHole 2ch, route call audio to it, "
                            "then start the system-audio service."
                        )
                else:
                    default_input, _default_output = sd.default.device
                    input_device = None if default_input in (None, -1) else int(default_input)

            if input_device is None:
                devices = sd.query_devices()
                input_device = next(
                    (index for index, device in enumerate(devices) if device.get("max_input_channels", 0) > 0),
                    None,
                )

            if input_device is None:
                raise RuntimeError(
                    "No microphone is available. Grant microphone access to Terminal/Python and reconnect the microphone."
                )

            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=min(2, int(sd.query_devices(input_device)["max_input_channels"])) if self.config.audio_source == "system" else CHANNELS,
                dtype="float32",
                callback=callback,
                blocksize=1600,
                device=input_device,
            ) as stream:
                self.stream = stream
                self._send_from_thread(
                    {
                        "type": "status",
                        "message": "system audio open" if self.config.audio_source == "system" else "microphone open",
                    }
                )
                while not self.stop_event.is_set():
                    try:
                        data = self.audio_queue.get(timeout=0.2)
                    except queue.Empty:
                        continue
                    window.append(data)
                    snapshot = window.snapshot(caught_up=self.audio_queue.empty())
                    if snapshot is None:
                        continue
                    utterance_id, audio, context_seconds, final = snapshot
                    started = time.monotonic()
                    segments, _info = self.model.transcribe(
                        audio,
                        beam_size=3,
                        vad_filter=True,
                        vad_parameters={"min_silence_duration_ms": 220, "speech_pad_ms": 100},
                        language="en",
                        condition_on_previous_text=False,
                        no_speech_threshold=0.65,
                        log_prob_threshold=-0.35,
                        compression_ratio_threshold=2.0,
                        temperature=0.0,
                        word_timestamps=True,
                    )
                    text = clean_repeated_text(" ".join(
                        word.word.strip() for segment in segments for word in (segment.words or [])
                        if (word.start + word.end) / 2 > context_seconds
                    ))
                    self._send_from_thread({"type": "segment", "id": utterance_id, "text": text,
                                            "isFinal": final})
                    print(f"{self.config.audio_source}: {len(audio) / SAMPLE_RATE:.1f}s audio, "
                          f"{time.monotonic() - started:.2f}s decode, "
                          f"{self.audio_queue.qsize() * .1:.1f}s queued", flush=True)
        except Exception as exc:
            message = str(exc)
            if "PaErrorCode -9986" in message or "Internal PortAudio error" in message:
                message = (
                    (
                        "System audio could not be opened. Confirm BlackHole is installed and selected as the call audio "
                        "route, then try Start again."
                        if self.config.audio_source == "system"
                        else "Microphone could not be opened. Grant microphone access to Terminal/Python "
                        "in System Settings > Privacy & Security > Microphone, then try Start again."
                    )
                )
            self._send_from_thread({"type": "error", "message": message})
        finally:
            self.stream = None
            self.stop_event.set()

    def _send_from_thread(self, message):
        if not self.stop_event.is_set() and not self.websocket.closed:
            asyncio.run_coroutine_threadsafe(self.websocket.send(json.dumps(message)), self.loop)


async def handle_client(websocket, config: TranscriptionConfig, model: WhisperModel):
    session: MicrophoneWhisperSession | None = None
    session_task: asyncio.Task | None = None
    loop = asyncio.get_running_loop()
    try:
        async for raw_message in websocket:
            message = json.loads(raw_message)
            if message.get("type") == "start" and session is None:
                source = message.get("audio_source", config.audio_source)
                if source not in ("microphone", "system"):
                    await websocket.send(json.dumps({"type": "error", "message": "Unknown audio source."}))
                    continue
                session = MicrophoneWhisperSession(websocket, replace(config, audio_source=source), loop, model)
                session_task = asyncio.create_task(session.start())
            elif message.get("type") == "stop" and session is not None:
                await session.stop()
                if session_task:
                    session_task.cancel()
                session = None
    finally:
        if session is not None:
            await session.stop()
        if session_task:
            session_task.cancel()


async def main():
    parser = argparse.ArgumentParser(description="Local faster-whisper microphone or system-audio transcription service.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--model", default="base.en")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--chunk-seconds", type=float, default=3.0)
    parser.add_argument("--input-device", type=int, default=None, help="Optional sounddevice input device index.")
    parser.add_argument(
        "--audio-source",
        choices=("microphone", "system"),
        default="microphone",
        help="Capture the microphone or a local system-audio device such as BlackHole.",
    )
    args = parser.parse_args()

    config = TranscriptionConfig(
        model=args.model,
        device=args.device,
        compute_type=args.compute_type,
        chunk_seconds=args.chunk_seconds,
        input_device=args.input_device,
        audio_source=args.audio_source,
    )

    print(f"Loading Whisper model '{config.model}'...")
    model = WhisperModel(config.model, device=config.device, compute_type=config.compute_type)
    print("Whisper model ready.")

    origins = [None, "null", "file://", "http://127.0.0.1:5173", "http://localhost:5173"]
    if os.environ.get("BULBY_RENDERER_ORIGIN"):
        origins.append(os.environ["BULBY_RENDERER_ORIGIN"])
    async with serve(lambda ws: handle_client(ws, config, model), args.host, args.port, origins=origins):
        print(f"Local Whisper transcription service listening on ws://{args.host}:{args.port}/transcribe")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
