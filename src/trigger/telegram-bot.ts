import { task } from "@trigger.dev/sdk";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gpt-oss:20b";

if (!TELEGRAM_TOKEN) {
  throw new Error("TELEGRAM_TOKEN is not configured.");
}

export const telegramBot = task({
  id: "telegram-webhook-handler",
  run: async (payload: any) => {
    const userText = payload.message?.text;
    const chatId = payload.message?.chat?.id;

    if (!userText || !chatId) {
      return {
        ignored: true,
        reason: "The Telegram update does not contain a message text and chat ID.",
      };
    }

    try {
      const ollamaUrl = process.env.USE_REMOTE_OLLAMA === "true" && process.env.OLLAMA_REMOTE_URL
        ? process.env.OLLAMA_REMOTE_URL
        : process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";

      const ollamaResponse = await fetch(ollamaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: false,
          prompt: `Reply concisely in the first person as the teacher to this student message: "${userText}"`,
        }),
      });

      if (!ollamaResponse.ok) {
        throw new Error(`Ollama request failed with status ${ollamaResponse.status}.`);
      }

      const data = await ollamaResponse.json();
      const generatedResponse = data.response;

      if (typeof generatedResponse !== "string" || !generatedResponse.trim()) {
        throw new Error("Ollama did not return a response string.");
      }

      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: generatedResponse,
          }),
        },
      );

      if (!telegramResponse.ok) {
        throw new Error(
          `Telegram request failed with status ${telegramResponse.status}.`,
        );
      }

      return {
        replied: true,
        chatId,
        text: generatedResponse,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      return {
        replied: false,
        error: message,
      };
    }
  },
});
