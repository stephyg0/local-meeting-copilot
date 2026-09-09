import { spawn } from "node:child_process";
import { createServer } from "vite";
import electron from "electron";

const compiler = spawn(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "electron/tsconfig.json"], { stdio: "inherit" });
const code = await new Promise(resolve => compiler.once("exit", resolve));
if (code !== 0) process.exit(Number(code) || 1);
const server = await createServer({ server: { host: "127.0.0.1", port: 5173, strictPort: false } });
await server.listen();
server.printUrls();
const address = server.httpServer.address();
const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: `http://127.0.0.1:${address.port}` }
});
let exiting = false;
async function cleanup(code = 0) {
  if (exiting) return;
  exiting = true;
  child.kill();
  await server.close();
  process.exit(code);
}
child.on("error", error => { console.error(error); void cleanup(1); });
child.on("exit", code => void cleanup(code || 0));
process.on("SIGINT", () => void cleanup());
process.on("SIGTERM", () => void cleanup());
