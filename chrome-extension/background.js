chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    if (message.type === "pair") {
      if (sender.tab || !/^[a-f0-9]{64}$/.test(message.token)) throw new Error("Invalid pairing code.");
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.url?.startsWith("https://chatgpt.com/")) throw new Error("Open ChatGPT first, then pair this tab.");
      await chrome.storage.local.set({ token: message.token, tabId: tabs[0].id });
      return { ok: true };
    }
    const { token, tabId } = await chrome.storage.local.get(["token", "tabId"]);
    if (!token || sender.tab?.id !== tabId || !sender.url?.startsWith("https://chatgpt.com/")) return null;
    const result = await fetch(`http://127.0.0.1:8766/${message.type === "poll" ? "next" : "result"}`, {
      method: message.type === "poll" ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(message.type === "poll" ? {} : { body: JSON.stringify(message.result) }),
      signal: AbortSignal.timeout(5000)
    });
    if (!result.ok) throw new Error("Bulby is unavailable or needs pairing again.");
    return result.json();
  })().then(reply, error => reply({ error: error.message }));
  return true;
});
