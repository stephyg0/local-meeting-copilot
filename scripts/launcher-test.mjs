import { _electron } from "playwright";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const executablePath = path.resolve("build/Bulby.app/Contents/MacOS/Electron");
const profile = await mkdtemp(path.join(tmpdir(), "bulby-launcher-test-"));
const args = [`--user-data-dir=${profile}`];
const env = { ...process.env };
delete env.VITE_DEV_SERVER_URL;
const app = await _electron.launch({ executablePath, args, env });
let logs = "";
app.process().stderr.on("data", data => { logs += data; });
try {
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "Expand copilot" }).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  const child = spawn(executablePath, args, { env, stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", data => { logs += data; });
  const timeout = setTimeout(() => child.kill(), 10000);
  const code = await new Promise((resolve, reject) => { child.on("exit", resolve); child.on("error", reject); });
  clearTimeout(timeout);
  assert.equal(code, 0);
  let visible = false;
  for (let n = 0; n < 30; n++) {
    visible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
    if (visible) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(visible, "second launch must restore the existing window");
  assert.ok(!logs.includes("Invalid socket message"), logs);
  console.log("PASS: standalone cold launch and second launch restore, without invalid socket messages.");
} finally { await app.close(); }
