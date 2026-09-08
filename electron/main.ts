import { app, BrowserWindow, desktopCapturer, ipcMain, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 620,
    minWidth: 420,
    minHeight: 420,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    title: "Local Meeting Copilot",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist-renderer/index.html"));
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  ipcMain.handle("screen:capture", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1280, height: 800 }
    });
    const primaryScreen = sources[0];
    if (!primaryScreen) {
      throw new Error("No screen sources were available.");
    }
    return {
      id: primaryScreen.id,
      name: primaryScreen.name,
      dataUrl: primaryScreen.thumbnail.toDataURL()
    };
  });

  ipcMain.handle("window:ignore-mouse", (_event, ignore: boolean) => {
    mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
    return true;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
