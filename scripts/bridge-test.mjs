import assert from "node:assert/strict";
import { createChatBridge } from "../dist-electron/chatBridge.js";
const bridge = createChatBridge();
await new Promise(resolve => bridge.server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${bridge.server.address().port}`;
const headers = { Authorization: `Bearer ${bridge.token}` };
try {
  assert.equal((await fetch(`${url}/next`)).status, 401);
  assert.equal(await (await fetch(`${url}/next`, { headers })).json(), null);
  assert.equal(bridge.connected(), true);
  const delivery = bridge.send("Test transcript", "data:image/png;base64,test");
  await assert.rejects(bridge.send("duplicate", "image"), /already in progress/);
  const job = await (await fetch(`${url}/next`, { headers })).json();
  assert.equal(job.prompt, "Test transcript");
  assert.equal(await (await fetch(`${url}/next`, { headers })).json(), null);
  await fetch(`${url}/result`, { method: "POST", headers, body: JSON.stringify({ id: job.id }) });
  await delivery;
  const failed = bridge.send("Test", "image");
  const rejection = assert.rejects(failed, /Sign in/);
  const second = await (await fetch(`${url}/next`, { headers })).json();
  await fetch(`${url}/result`, { method: "POST", headers, body: JSON.stringify({ id: second.id, error: "Sign in" }) });
  await rejection;
  console.log("PASS: browser bridge authentication, single delivery, acknowledgement, error propagation.");
} finally { bridge.server.close(); }
