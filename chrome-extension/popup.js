document.querySelector("#pair").onclick = async () => {
  const result = await chrome.runtime.sendMessage({ type: "pair", token: document.querySelector("#token").value.trim() });
  document.querySelector("#status").textContent = result?.error || "Connected. Keep this tab open and signed in.";
};
