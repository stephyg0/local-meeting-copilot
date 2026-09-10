const button = document.querySelector("#pair");
const input = document.querySelector("#token");
const status = document.querySelector("#status");
let busy = false;
let interacted = false;

function report(text, state) {
  status.textContent = text;
  status.dataset.state = state;
}

async function showSavedPairing() {
  try {
    const { token, tabId } = await chrome.storage.local.get(["token", "tabId"]);
    if (!token || tabId === undefined) return;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (interacted) return;
    if (tab?.url?.startsWith("https://chatgpt.com/")) {
      report(active?.id === tabId ? "This tab is paired with Bulby." : "Bulby is paired with another ChatGPT tab.", "success");
      button.textContent = active?.id === tabId ? "Pair again" : "Pair this tab";
    } else {
      report("Your paired tab is closed. Open ChatGPT and pair it again.", "error");
    }
  } catch {
    if (!interacted) report("Could not read pairing status. Reopen the extension to retry.", "error");
  }
}

input.addEventListener("input", () => { interacted = true; });
button.onclick = async () => {
  if (busy) return;
  busy = true;
  interacted = true;
  button.disabled = true;
  input.disabled = true;
  button.textContent = "Pairing...";
  report("Connecting this tab...", "pending");
  try {
    const result = await chrome.runtime.sendMessage({ type: "pair", token: input.value.trim() });
    if (!result?.ok) throw new Error(result?.error || "Pairing was not confirmed. Please try again.");
    button.textContent = "Paired";
    input.value = "";
    report("Paired successfully. Keep your ChatGPT tab open.", "success");
    window.setTimeout(() => window.close(), 1200);
  } catch (error) {
    report(error.message || "Could not pair. Please try again.", "error");
    button.textContent = "Try again";
    button.disabled = false;
    input.disabled = false;
    busy = false;
  }
};
input.addEventListener("keydown", event => {
  if (event.key === "Enter") { event.preventDefault(); void button.onclick(); }
});
void showSavedPairing();
