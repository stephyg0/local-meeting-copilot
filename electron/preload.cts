import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("meetingCopilot", {
  ensureTranscription: () => ipcRenderer.invoke("transcription:ensure"),
  pairBrowser: () => ipcRenderer.invoke("browser:pair"),
  askBrowser: (transcript: string, screenshot: string) => ipcRenderer.invoke("browser:ask", transcript, screenshot),
  captureScreen: () => ipcRenderer.invoke("screen:capture"),
  copyText: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  resizeWindow: (expanded: boolean, transcriptVisible: boolean) => ipcRenderer.invoke("window:resize", expanded, transcriptVisible),
  resizeWindowToContent: (contentHeight: number) => ipcRenderer.invoke("window:resize-content", contentHeight),
  resizeWindowStart: (corner: "bottom-left" | "bottom-center" | "bottom-right", startX: number, startY: number) => ipcRenderer.invoke("window:resize-start", corner, startX, startY),
  resizeWindowMove: (currentX: number, currentY: number) => ipcRenderer.invoke("window:resize-move", currentX, currentY),
  resizeWindowEnd: () => ipcRenderer.invoke("window:resize-end"),
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.invoke("window:ignore-mouse", ignore)
});
