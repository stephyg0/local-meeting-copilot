import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("meetingCopilot", {
  captureScreen: () => ipcRenderer.invoke("screen:capture"),
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.invoke("window:ignore-mouse", ignore)
});
