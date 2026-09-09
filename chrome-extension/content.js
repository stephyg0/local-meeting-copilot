let busy = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await delay(200);
  }
  throw new Error("ChatGPT was not ready. Check sign-in, attachment upload, and the composer before retrying.");
}
async function send(job) {
  const editor = await until(() => document.querySelector('#prompt-textarea[contenteditable="true"]'));
  if (editor.textContent.trim() || document.querySelector('[data-testid="stop-button"]')) {
    throw new Error("ChatGPT has an unfinished draft or answer. Finish it before pressing Ask again.");
  }
  editor.focus();
  const image = await (await fetch(job.screenshot)).blob();
  const transfer = new DataTransfer();
  transfer.items.add(new File([image], "bulby-screen.png", { type: image.type }));
  editor.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  // Do not send until ChatGPT visibly accepts an image attachment.
  await until(() => editor.closest("form")?.querySelector('img[src^="blob:"], img[alt*="upload" i], button[aria-label*="remove" i]'));
  editor.focus();
  document.execCommand("insertText", false, job.prompt);
  if (!editor.textContent.includes(job.prompt.slice(0, 80))) throw new Error("Could not fill the ChatGPT prompt. Nothing was submitted.");
  const button = await until(() => {
    const candidate = document.querySelector('[data-testid="send-button"]');
    return candidate && !candidate.disabled ? candidate : null;
  });
  button.click();
  await until(() => !editor.textContent.trim(), 10000);
}
setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    const job = await chrome.runtime.sendMessage({ type: "poll" });
    if (!job?.id) return;
    let error;
    try { await send(job); } catch (failure) { error = failure.message; }
    await chrome.runtime.sendMessage({ type: "result", result: { id: job.id, error } });
  } catch { /* Disconnected Bulby is idle, not a reason to touch the page. */ }
  finally { busy = false; }
}, 1000);
