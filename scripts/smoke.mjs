import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright";

const profile = await mkdtemp(join(tmpdir(), "bulby-test-"));
const env = { ...process.env, BULBY_TEST_PROFILE: profile };
delete env.VITE_DEV_SERVER_URL;
const app = await electron.launch({ args: ["scripts/electron-fixture.mjs"], env });
try {
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "Expand copilot" }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.meetingCopilot?.resizeWindow), "function", "sandboxed preload must load");
  async function bounds() {
    return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  }
  async function matched() {
    for (let attempt = 0; attempt < 30; attempt++) {
      const native = await bounds();
      const visual = await page.locator(".pet-shell").boundingBox();
      if (native.width === Math.ceil(visual.width) && native.height === Math.ceil(visual.height)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail("Native bounds did not settle to the visual panel bounds.");
  }
  await matched();
  for (let n = 0; n < 3; n++) {
    await page.getByRole("button", { name: "Expand copilot" }).click();
    await page.waitForFunction(() => innerWidth === 520);
    await matched();
    await page.getByRole("button", { name: "Show transcript" }).click();
    await page.getByText("No transcript yet.").waitFor();
    await matched();
    await page.getByRole("button", { name: "Hide transcript" }).click();
    await page.getByRole("button", { name: "Collapse copilot" }).click();
    await page.waitForFunction(() => innerWidth === 94);
    await matched();
  }
  await page.getByRole("button", { name: "Expand copilot" }).click();
  await page.waitForFunction(() => innerWidth === 520);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(500, 400));
  await matched();
  await page.screenshot({ path: "/tmp/bulby-expanded-tested.png" });
  await page.getByRole("button", { name: "Close copilot" }).click();
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await app.evaluate(({ app }) => app.emit("activate"));
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  // Exercise the extension against a synthetic composer, never a real chat.
  await page.setContent('<form><div id="prompt-textarea" contenteditable="true"></div><button type="button" data-testid="send-button">Send</button></form>');
  await page.evaluate(() => {
    window.testResults = [];
    let claimed = false;
    window.chrome = { runtime: { sendMessage: async message => {
      if (message.type === "result") { window.testResults.push(message.result); return; }
      if (claimed) return null;
      claimed = true;
      return { id: "synthetic", prompt: "Explain this synthetic example.", screenshot: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=" };
    } } };
    document.querySelector('#prompt-textarea').addEventListener('paste', event => {
      window.pastedFileCount = event.clipboardData.files.length;
      const remove = document.createElement('button');
      remove.setAttribute('aria-label', 'Remove attachment');
      document.querySelector('form').append(remove);
    });
    document.querySelector('[data-testid="send-button"]').onclick = () => {
      window.sentPrompt = document.querySelector('#prompt-textarea').textContent;
      document.querySelector('#prompt-textarea').textContent = '';
    };
  });
  await page.addScriptTag({ content: await readFile('chrome-extension/content.js', 'utf8') });
  await page.waitForFunction(() => window.testResults.length === 1);
  assert.deepEqual(await page.evaluate(() => ({ result: window.testResults[0], count: window.pastedFileCount, prompt: window.sentPrompt })), { result: { id: 'synthetic', error: undefined }, count: 1, prompt: 'Explain this synthetic example.' });
  console.log("PASS: sandbox preload, repeated expansion, transcript visibility, exact native/visual bounds, manual resizing, reopen, synthetic screenshot and prompt submission.");
} finally { await app.close(); }
