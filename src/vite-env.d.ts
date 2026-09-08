/// <reference types="vite/client" />

interface ScreenCaptureResult {
  id: string;
  name: string;
  dataUrl: string;
}

interface Window {
  meetingCopilot?: {
    captureScreen: () => Promise<ScreenCaptureResult>;
    setIgnoreMouseEvents: (ignore: boolean) => Promise<boolean>;
  };
}
