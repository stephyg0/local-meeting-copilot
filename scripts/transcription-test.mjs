import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

globalThis.window = globalThis;
class Socket {
  static OPEN = 1;
  static instances = [];
  readyState = 0;
  constructor() {
    Socket.instances.push(this);
    queueMicrotask(() => { if (this.readyState !== 3) { this.readyState = 1; this.onopen?.(); } });
  }
  send(raw) { this.command = JSON.parse(raw); }
  message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
globalThis.WebSocket = Socket;
const source = await readFile('src/transcription/whisperServiceTranscription.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { WhisperServiceTranscriptionProvider: Provider } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const provider = new Provider();
const transcript = [];
const start = provider.start(segment => transcript.push(segment.text), undefined, 'both');
await new Promise(resolve => setImmediate(resolve));
const [mic, call] = Socket.instances;
assert.equal(mic.command.audio_source, 'microphone');
assert.equal(call.command.audio_source, 'system');
mic.message({ type: 'status', message: 'microphone open' });
call.message({ type: 'status', message: 'system audio open' });
await start;
mic.message({ type: 'segment', text: 'My voice' });
call.message({ type: 'segment', text: 'Call voice' });
assert.deepEqual(transcript, ['[Microphone] My voice', '[Call] Call voice']);
await provider.stop();
assert.ok(Socket.instances.every(socket => socket.readyState === 3));

const failed = provider.start(() => {}, undefined, 'both');
const rejected = assert.rejects(failed, /No loopback/);
await new Promise(resolve => setImmediate(resolve));
Socket.instances.at(-1).message({ type: 'error', message: 'No loopback' });
await rejected;
assert.ok(Socket.instances.every(socket => socket.readyState === 3), 'one source failing must stop both');
console.log('PASS: dual source startup, source labels, stop, and failure cleanup.');
