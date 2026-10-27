// An isolated local fixture: never imports .env or contacts production services.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { handleApi } from "../api.mjs";
import { mockServices, businessId, documentId } from "./mock-services.mjs";

process.env.SUPABASE_URL = "https://release-test.supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
process.env.OPENROUTER_API_KEY = "test-only-ai-key";
process.env.TELEGRAM_WEBHOOK_BASE_URL = "https://fixture.example.invalid";
const fixture = mockServices();
fixture.data.conversations.push(
  {
    id: "sample-question",
    business_id: businessId,
    chat_id: "telegram:123",
    role: "user",
    content: "How much is the beginner class?",
    sources: [],
    created_at: new Date().toISOString(),
  },
  {
    id: "sample-answer",
    business_id: businessId,
    chat_id: "telegram:123",
    role: "assistant",
    content: fixture.generated.answer,
    sources: ["Studio handbook.txt"],
    created_at: new Date().toISOString(),
  },
);
fixture.data.unanswered_questions.push({
  id: "55555555-5555-4555-8555-555555555555",
  business_id: businessId,
  question: "Do you offer gift vouchers?",
  created_at: new Date().toISOString(),
});
globalThis.fetch = fixture.fetch;
const root = resolve(import.meta.dirname, "../../dist");
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/documents/upload-url") {
    const end = res.end.bind(res);
    res.end = (body) => {
      const data = JSON.parse(body);
      if (data.signedUrl)
        data.signedUrl = `http://localhost:3100/fixture/upload/${encodeURI(data.path)}`;
      return end(JSON.stringify(data));
    };
  }
  if (url.pathname.startsWith("/fixture/upload/") && req.method === "PUT") {
    const parts = [];
    for await (const part of req) parts.push(part);
    fixture.files.set(
      decodeURIComponent(url.pathname.slice("/fixture/upload/".length)),
      Buffer.concat(parts),
    );
    res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
    return;
  }
  if (url.pathname === "/api/config") {
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(
        JSON.stringify({
          supabaseUrl: "http://localhost:3100/fixture",
          supabaseAnonKey: "fixture-public-key",
        }),
      );
    return;
  }
  if (url.pathname.startsWith("/fixture/auth/v1/")) {
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(
        JSON.stringify({
          access_token: "test-access",
          refresh_token: "test-refresh",
          expires_in: 3600,
        }),
      );
    return;
  }
  if (url.pathname === "/api/chat" && req.method === "POST") {
    const parts = [];
    for await (const part of req) parts.push(part);
    req.body = JSON.parse(Buffer.concat(parts).toString());
    fixture.generated = /gift|unicorn/i.test(req.body.question)
      ? { answer: "Unknown", supported: false, source_ids: [] }
      : {
          answer: "The beginner pottery class is $35, including all materials.",
          supported: true,
          source_ids: [1],
        };
  }
  if (await handleApi(req, res)) return;
  try {
    const file = resolve(
      root,
      "." +
        (url.pathname === "/"
          ? "/index.html"
          : url.pathname === "/workspace"
            ? "/workspace.html"
            : url.pathname),
    );
    if (!file.startsWith(root + sep)) throw new Error("Invalid path");
    const types = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "text/javascript",
      ".svg": "image/svg+xml",
    };
    res
      .writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      })
      .end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
});
server.listen(3100, "127.0.0.1", () =>
  console.log(
    "Isolated UI fixture: http://localhost:3100/workspace (demo@example.invalid / any 8-character password)",
  ),
);
