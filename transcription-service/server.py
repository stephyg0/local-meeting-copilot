import argparse
import asyncio
import json
import queue
import threading
from dataclasses import dataclass

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
from websockets.server import serve


SAMPLE_RATE = 16000
CHANNELS = 1


@dataclass
class TranscriptionConfig:
    model: str
    device: str
    compute_type: str
    chunk_seconds: float


class MicrophoneWhisperSession:
    def __init__(self, websocket, config: TranscriptionConfig, loop: asyncio.AbstractEventLoop):
        self.websocket = websocket
        self.config = config
        self.loop = loop
        self.audio_queue: queue.Queue[np.ndarray] = queue.Queue()
        self.stop_event = threading.Event()
        self.model = WhisperModel(config.model, device=config.device, compute_type=config.compute_type)
        self.stream: sd.InputStream | None = None

    async def start(self):
        await self.send_status("loading")
        worker = threading.Thread(target=self._record_and_transcribe, daemon=True)
        worker.start()
        await self.send_status("listening")

        while not self.stop_event.is_set():
            await asyncio.sleep(0.1)

    async def stop(self):
        self.stop_event.set()
        if self.stream:
            self.stream.stop()
            self.stream.close()

    async def send_status(self, message: str):
        await self.websocket.send(json.dumps({"type": "status", "message": message}))

    def _record_and_transcribe(self):
        chunk_size = int(SAMPLE_RATE * self.config.chunk_seconds)
        buffer = np.empty((0,), dtype=np.float32)

        def callback(indata, frames, _time, status):
            if status:
                self.audio_queue.put(np.zeros(frames, dtype=np.float32))
            self.audio_queue.put(indata[:, 0].copy())

        try:
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="float32",
                callback=callback,
            ) as stream:
                self.stream = stream
                while not self.stop_event.is_set():
                    data = self.audio_queue.get()
                    buffer = np.concatenate([buffer, data])
                    if buffer.shape[0] < chunk_size:
                        continue

                    audio = buffer[:chunk_size]
                    buffer = buffer[chunk_size:]
                    segments, _info = self.model.transcribe(
                        audio,
                        beam_size=1,
                        vad_filter=True,
                        language="en",
                    )
                    text = " ".join(segment.text.strip() for segment in segments).strip()
                    if text:
                        self._send_from_thread({"type": "segment", "text": text})
        except Exception as exc:
            self._send_from_thread({"type": "error", "message": str(exc)})

    def _send_from_thread(self, message):
        asyncio.run_coroutine_threadsafe(self.websocket.send(json.dumps(message)), self.loop)


async def handle_client(websocket, config: TranscriptionConfig):
    session: MicrophoneWhisperSession | None = None
    session_task: asyncio.Task | None = None
    loop = asyncio.get_running_loop()
    async for raw_message in websocket:
        message = json.loads(raw_message)
        if message.get("type") == "start" and session is None:
            session = MicrophoneWhisperSession(websocket, config, loop)
            session_task = asyncio.create_task(session.start())
        elif message.get("type") == "stop" and session is not None:
            await session.stop()
            if session_task:
                session_task.cancel()
            session = None


async def main():
    parser = argparse.ArgumentParser(description="Local faster-whisper microphone transcription service.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--model", default="base.en")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--chunk-seconds", type=float, default=5.0)
    args = parser.parse_args()

    config = TranscriptionConfig(
        model=args.model,
        device=args.device,
        compute_type=args.compute_type,
        chunk_seconds=args.chunk_seconds,
    )

    async with serve(lambda ws: handle_client(ws, config), args.host, args.port):
        print(f"Local Whisper transcription service listening on ws://{args.host}:{args.port}/transcribe")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
