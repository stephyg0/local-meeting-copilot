import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";

export function createChatBridge(token = randomBytes(32).toString("hex")) {
  let pending: { id: string; prompt: string; screenshot: string; claimed: boolean } | null = null;
  let finish: ((error?: string) => void) | null = null;
  let lastSeen = 0;
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end();
      return;
    }
    lastSeen = Date.now();
    response.setHeader("Content-Type", "application/json");
    if (request.method === "GET" && request.url === "/next") {
      const job = pending && !pending.claimed ? pending : null;
      if (job) job.claimed = true;
      response.end(JSON.stringify(job));
      return;
    }
    if (request.method === "POST" && request.url === "/result") {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 4096) { response.writeHead(413).end(); return; }
      }
      try {
        const result = JSON.parse(body);
        if (pending?.id === result.id) finish?.(result.error || undefined);
        response.end("{}");
      } catch { response.writeHead(400).end(); }
      return;
    }
    response.writeHead(404).end();
  });
  return {
    token,
    server,
    connected: () => Date.now() - lastSeen < 10000,
    send(prompt: string, screenshot: string): Promise<void> {
      if (pending) return Promise.reject(new Error("A ChatGPT request is already in progress."));
      return new Promise((resolve, reject) => {
        pending = { id: randomUUID(), prompt, screenshot, claimed: false };
        const timeout = setTimeout(() => finish?.("ChatGPT did not confirm sending. Check the tab before retrying."), 60000);
        finish = (error) => {
          clearTimeout(timeout);
          pending = null;
          finish = null;
          if (error) reject(new Error(error)); else resolve();
        };
      });
    }
  };
}
