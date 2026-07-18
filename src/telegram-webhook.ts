import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tasks } from "@trigger.dev/sdk";
import type { telegramBot } from "./trigger/telegram-bot";

const port = Number(process.env.PORT ?? 3000);
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!webhookSecret) {
  throw new Error("TELEGRAM_WEBHOOK_SECRET is not configured.");
}

if (!process.env.TRIGGER_SECRET_KEY) {
  throw new Error("TRIGGER_SECRET_KEY is not configured.");
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > 1_000_000) {
      throw new Error("Webhook payload exceeds 1 MB.");
    }

    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/telegram/webhook") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  if (request.headers["x-telegram-bot-api-secret-token"] !== webhookSecret) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  try {
    const update = await readJson(request);
    const run = await tasks.trigger<typeof telegramBot>(
      "telegram-webhook-handler",
      update,
    );

    sendJson(response, 202, { accepted: true, runId: run.id });
  } catch (error) {
    console.error("Unable to accept Telegram webhook:", error);
    sendJson(response, 500, { error: "Unable to accept update" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Telegram webhook receiver listening on http://127.0.0.1:${port}`);
});
