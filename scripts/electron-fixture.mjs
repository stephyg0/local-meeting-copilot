import { app } from "electron";
app.setPath("userData", process.env.BULBY_TEST_PROFILE);
await import("../dist-electron/main.js");
