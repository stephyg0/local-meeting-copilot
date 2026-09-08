# Local Meeting Copilot

Local Meeting Copilot is a small local-first desktop meeting copilot MVP. It uses Electron for a transparent always-on-top companion overlay, React + TypeScript for the UI, a local faster-whisper transcription service for real microphone transcription, and Ollama as the default local assistant backend when available.

The default flow does not automate, scrape, or control the ChatGPT consumer website, and it does not require OpenAI API credits.

## MVP status

- Transparent always-on-top desktop overlay.
- Explicit Start and Stop controls for microphone capture.
- Clear recording indicator while capture is active.
- Real local microphone transcription through a faster-whisper WebSocket service.
- Mock transcription fallback so the UI can still be tested before local speech models are installed.
- Explicit Capture Screen Context button using Electron's OS-supported screen capture APIs.
- Ask Assistant sends the transcript and screenshot-presence context to Ollama when it is reachable.
- Mock assistant fallback when Ollama is missing or not running.
- Provider interfaces for assistant and transcription backends.
- Scaffold for a future local Whisper service boundary.

## Privacy model

All privacy-sensitive actions are opt-in and visible:

- Microphone access is requested only after pressing **Start**.
- Audio tracks are stopped after pressing **Stop**.
- Screen context is captured only after pressing **Capture Screen Context**.
- Assistant calls happen only after pressing **Ask Assistant**.
- By default, assistant calls target `http://127.0.0.1:11434`, the local Ollama HTTP API.

The app intentionally does not include any ChatGPT website automation. A future official OpenAI API provider should be added as a new implementation of the assistant provider interface and kept disabled unless explicitly configured.

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.
- Optional: Ollama for local assistant responses.
- Optional future path: Python 3.10+ plus faster-whisper or whisper.cpp for real local transcription.

## Quick start

Install app dependencies:

```bash
npm install
```

Install the local transcription service:

```bash
npm run transcribe:setup
```

Start real local transcription in one terminal:

```bash
npm run transcribe:server
```

Run the desktop app:

```bash
npm run dev
```

The app opens as a transparent always-on-top companion. Press **Start** to connect to the local Whisper service. On macOS, the terminal or Python process may ask for microphone permission the first time the service captures audio.

## Ollama setup

Install Ollama from:

```text
https://ollama.com
```

Pull the default model used by this MVP:

```bash
ollama pull llama3.2
```

Start Ollama:

```bash
ollama serve
```

Then press **Ask Assistant** in the overlay. If Ollama is unavailable, the app shows a mock response instead of failing the UI.

## Local transcription

The app connects to:

```text
ws://127.0.0.1:8765/transcribe
```

Set up manually if you do not want to use the npm helper:

```bash
python3 -m venv transcription-service/.venv
source transcription-service/.venv/bin/activate
pip install -r transcription-service/requirements.txt
python transcription-service/server.py
```

The service defaults to the `base.en` faster-whisper model on CPU with int8 compute. You can change it:

```bash
transcription-service/.venv/bin/python transcription-service/server.py --model small.en --chunk-seconds 4
```

The transcription code lives in:

- `src/transcription/types.ts`
- `src/transcription/mockTranscription.ts`
- `src/transcription/whisperServiceTranscription.ts`
- `transcription-service/server.py`

## Architecture

Assistant providers implement:

```ts
interface AssistantProvider {
  readonly id: string;
  readonly label: string;
  ask(request: AssistantRequest): Promise<AssistantResponse>;
}
```

Current implementations:

- `OllamaAssistantProvider`
- `MockAssistantProvider`

Transcription providers implement:

```ts
interface TranscriptionProvider {
  readonly id: string;
  readonly label: string;
  start(listener: TranscriptListener): Promise<void>;
  stop(): Promise<void>;
}
```

Current implementations:

- `MockTranscriptionProvider`
- `WhisperServiceTranscriptionProvider`

## Common error states

- **Ollama is not reachable**: start Ollama or keep using demo mode.
- **Missing microphone permission**: grant microphone access for Terminal, Python, or the packaged app in system settings, then press Start again.
- **Missing screen-capture permission**: grant screen recording permission for the app in system settings, then press Capture Screen Context again.

## Build

```bash
npm run build
```

Start the built app:

```bash
npm start
```
