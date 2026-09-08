import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const electronCommand = isWindows ? "electron.cmd" : "electron";

const processes = [];

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options
  });
  processes.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) {
      cleanup(code);
    }
  });
  return child;
}

function cleanup(code = 0) {
  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));

run(npmCommand, ["exec", "tsc", "--", "-p", "electron/tsconfig.json", "--watch", "--preserveWatchOutput"]);
run(npmCommand, ["exec", "vite"]);

setTimeout(() => {
  run(electronCommand, ["."], {
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: "http://localhost:5173"
    }
  });
}, 1600);
