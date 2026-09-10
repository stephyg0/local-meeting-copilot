/// <reference types="vite/client" />

interface ScreenCaptureResult {
  id: string;
  name: string;
  dataUrl: string;
}

interface Window {
  meetingCopilot?: {
    ensureTranscription: () => Promise<void>;
    pairBrowser: () => Promise<boolean>;
    askBrowser: (transcript: string, screenshot: string) => Promise<boolean>;
    captureScreen: () => Promise<ScreenCaptureResult>;
    copyText: (text: string) => Promise<boolean>;
    minimizeWindow: () => Promise<boolean>;
    closeWindow: () => Promise<boolean>;
    resizeWindow: (expanded: boolean, transcriptVisible: boolean, compactAsk?: boolean) => Promise<boolean>;
    resizeWindowToContent: (contentHeight: number) => Promise<boolean>;
    resizeWindowStart: (corner: "bottom-left" | "bottom-center" | "bottom-right", startX: number, startY: number) => Promise<boolean>;
    resizeWindowMove: (currentX: number, currentY: number) => Promise<boolean>;
    resizeWindowEnd: () => Promise<boolean>;
    setIgnoreMouseEvents: (ignore: boolean) => Promise<boolean>;
  };
}
