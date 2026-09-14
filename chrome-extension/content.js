let busy = false;
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type === "bulby:ready") reply({ ok: true });
});
function until(check, timeout = 15000, failure = "ChatGPT's composer is unavailable. Open the paired tab and check that you are signed in.") {
  return new Promise((resolve, reject) => {
    let timer;
    const observer = new MutationObserver(inspect);
    function finish(error, value) {
      observer.disconnect();
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    }
    function inspect() {
      try {
        const value = check();
        if (value) finish(null, value);
      } catch (error) { finish(error); }
    }
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    timer = setTimeout(() => finish(new Error(failure)), timeout);
    inspect();
  });
}
async function send(job) {
  const editor = await until(() => document.querySelector('#prompt-textarea[contenteditable="true"]'));
  if (editor.textContent.trim() || document.querySelector('[data-testid="stop-button"]')) {
    throw new Error("ChatGPT has an unfinished draft or answer. Finish it before pressing Ask again.");
  }
  editor.focus();
  const image = await (await fetch(job.screenshot)).blob();
  const transfer = new DataTransfer();
  transfer.items.add(new File([image], image.type === "image/jpeg" ? "bulby-screen.jpg" : "bulby-screen.png", { type: image.type }));
  editor.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  editor.focus();
  document.execCommand("insertText", false, job.prompt);
  if (!editor.textContent.includes(job.prompt.slice(0, 80))) throw new Error("Could not fill the ChatGPT prompt. Nothing was submitted.");
  // Fill the prompt while the image uploads, but never submit without an attachment.
  await until(() => editor.closest("form")?.querySelector('img[src^="blob:"], img[alt*="upload" i], button[aria-label*="remove" i]'), 15000,
    "ChatGPT did not accept the screenshot. Check the attachment in the paired tab; nothing was submitted.");
  const button = await until(() => {
    const candidate = editor.closest("form")?.querySelector('[data-testid="send-button"]');
    return candidate && !candidate.disabled && candidate.getAttribute("aria-disabled") !== "true" ? candidate : null;
  }, 15000, "ChatGPT's Send button is still unavailable. Check whether the screenshot is uploading or ChatGPT shows a limit. Your draft has not been submitted.");
  button.click();
  await until(() => !editor.textContent.trim(), 10000, "ChatGPT did not confirm submission. Check the tab before retrying to avoid a duplicate.");
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
}, 250);
