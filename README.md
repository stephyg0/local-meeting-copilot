# Bulby

A local desktop transcription overlay with an explicit Ask handoff to your ChatGPT tab in Chrome. Audio transcription uses faster-whisper locally. Ask sends the current transcript and a fresh screenshot to ChatGPT through the included browser extension; that context leaves your computer and is processed by ChatGPT. No OpenAI API key is required.

## Run

```bash
npm install
npm run transcribe:setup
npm run dev
```

Start launches the local Whisper service when needed. The first model load can take longer while downloading `base.en`. The renderer and Electron start in the correct order. If port 5173 is occupied, the launcher selects another port. For a built desktop run without Vite:

```bash
npm start
```

Click the blue face to expand/collapse. The compact size is 94 x 44; the expanded default width is 520. Drag the header to move, and the bottom edge/corners to resize. Transcript is hidden by default and can be shown, copied in full, or cleared. X stops recording and minimizes the window; the Dock icon restores it. Quit from the application menu to exit.

## Connect ChatGPT Once

On this Mac, open `build/Bulby.app` directly or click **Open Bulby** in the Chrome extension. Chrome may ask you to allow opening Bulby. The launcher is registered for `bulby://open` and starts the built desktop app without Terminal or Codex. Keep this project folder in place: the local launcher uses its built files and transcription environment. Rebuild with `npm run build` after code changes. This is a local launcher, not a portable distribution. To create one on another Mac after installing dependencies, run `npm run build` then `node scripts/create-launcher.mjs` and open the resulting app once to register it.

1. In Chrome, open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select this project's `chrome-extension` folder.
3. Open `https://chatgpt.com/`, sign in, and open the conversation to use.
4. In Bulby, press **Connect Chrome**. This copies a private pairing code and brings Chrome's existing window forward (or launches Chrome if it is closed).
5. Open the Bulby extension popup on the ChatGPT tab, paste the code, and press **Connect**.
6. Keep the paired tab open. Reload it if the extension was installed after the tab opened. Re-pair a replacement tab if you close it.

Press **Ask** to capture the display containing Bulby and snapshot the transcript at that instant. The extension attaches the image, fills the prompt, and clicks Send. Bulby only reports success after receiving confirmation. It does not read or display ChatGPT answers; read them in Chrome. A nonempty composer or an answer in progress blocks submission. Missing connection, permission, or changed ChatGPT controls produce an error, never a mock answer. Check the ChatGPT tab before retrying a timed-out request to avoid duplicates.

The extension depends on ChatGPT's web UI, which can change. Automatic sending has been implemented but still requires a live signed-in integration test after extension setup. Do not rely on it for a class until that test succeeds.

## Audio Sources

Choose **Microphone** for your voice, **Call audio** for a virtual loopback input, or **Both** to capture both simultaneously. Both opens two independent streams and labels their transcript entries; this is source labeling, not speaker identification. Selection is locked while recording. Start only shows recording after both devices open. If either fails, both stop. Use headphones to avoid transcribing call audio twice through your microphone. Two active sources require more processing and may increase latency. Live dual-device accuracy still needs testing on your hardware.

For call audio on this Mac, install BlackHole in Terminal (macOS asks for an administrator password):

```bash
brew install --cask blackhole-2ch
```

In Audio MIDI Setup, create a Multi-Output Device containing your headphones/speakers and BlackHole 2ch. Route your meeting application's output to that device so you can still hear it, then choose **Call audio** in Bulby. See the [official BlackHole routing guide](https://github.com/ExistentialAudio/BlackHole#record-system-audio). BlackHole was not installed during automated setup because the installer required an administrator password.

Grant microphone permission to the process macOS requests for audio input, and Screen Recording permission to Bulby/Electron for Ask screenshots. Screen capture requires explicit Ask; it is never continuous. Transcription stays in memory, and the browser handoff keeps one request in memory until success, failure, or timeout. Closing the app discards unsaved text.

For manual service control, run only one service on port 8765:

```bash
npm run transcribe:server
# Or for older clients that do not specify a source:
npm run transcribe:system
```

The UI specifies its selected source on each Start. An older already-running service must be restarted after upgrading. A port-in-use error means a service is already listening; do not launch duplicates. For a different model, stop the existing service first and run:

```bash
transcription-service/.venv/bin/python transcription-service/server.py --model small.en
```

Larger models may improve accuracy at a latency cost. Streaming previews begin after about one second of speech plus model processing time. Draft entries are revised in place and included in Ask and Copy. Pauses finalize a draft; continuous speech is bounded to eight-second windows with 0.8 seconds of overlap. Word timestamps exclude the previously transcribed overlap. Pending audio skips stale previews, while final windows are retained; sustained overload stops capture with an error rather than growing an unlimited backlog. The service logs decode time and queued audio duration without logging transcript text. Whisper may still misrecognize speech; real-call accuracy and latency need testing with your headset and meeting audio.

## Verification

```bash
npm run typecheck
npm run test:desktop
npm run test:bridge
transcription-service/.venv/bin/python transcription-service/test_service.py
```

Desktop tests open an isolated Electron profile and verify the sandbox preload, repeated expansion, transcript show/hide, native/visual dimensions, resize, Dock-style restoration, and synthetic screenshot/prompt submission. Bridge tests use synthetic context to verify authentication, single delivery, acknowledgement and error propagation. Python tests verify source selection and disconnect cleanup without recording.

The assistant provider interfaces and Ollama/official-API stubs remain in `src/assistant` for future integrations, but the current Ask flow uses Chrome exclusively. This is a development desktop app, not a signed/notarized macOS installer.
