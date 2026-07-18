import { task } from "@trigger.dev/sdk";
import { appendFile, mkdir, readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
const conversationLogPath = resolve(
  process.env.CONVERSATION_LOG_PATH ?? "conversations/telegram-conversations.jsonl",
);
const conversationTranscriptPath = resolve(
  process.env.CONVERSATION_TRANSCRIPT_PATH ?? "conversations/telegram-conversations.txt",
);

if (!TELEGRAM_TOKEN) {
  throw new Error("TELEGRAM_TOKEN is not configured.");
}

async function saveConversation(
  chatId: number,
  userText: string,
  generatedResponse: string,
) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    chatId,
    userText,
    generatedResponse,
  };

  await Promise.all([
    mkdir(dirname(conversationLogPath), { recursive: true }).then(() =>
      appendFile(conversationLogPath, `${JSON.stringify(entry)}\n`, "utf8"),
    ),
    mkdir(dirname(conversationTranscriptPath), { recursive: true }).then(() =>
      appendFile(
        conversationTranscriptPath,
        [
          `Conversation — ${timestamp}`,
          `Chat ID: ${chatId}`,
          `Student: ${userText}`,
          `Teacher: ${generatedResponse}`,
          "",
        ].join("\n"),
        "utf8",
      ),
    ),
  ]);
}

async function getConversationHistory(chatId: number, maxEntries: number = 5) {
  try {
    await access(conversationLogPath);
    const content = await readFile(conversationLogPath, "utf8");
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    const entries = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(entry => entry && entry.chatId === chatId);
    
    // Return the most recent entries, limited by maxEntries
    return entries.slice(-maxEntries);
  } catch (error) {
    // File doesn't exist or can't be read
    return [];
  }
}

function buildContextPrompt(history: any[], currentMessage: string): string {
  if (history.length === 0) {
    return `You are a helpful teacher. Reply concisely in the first person to this student message: "${currentMessage}"`;
  }
  
  let context = "You are a helpful teacher having a conversation with a student. Here is the recent conversation history:\n\n";
  
  for (const entry of history) {
    context += `Student: ${entry.userText}\n`;
    context += `Teacher: ${entry.generatedResponse}\n\n`;
  }
  
  context += `Now the student says: "${currentMessage}"\n\n`;
  context += `Based on the conversation history above, reply concisely in the first person as the teacher.`;
  
  return context;
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
      // Get conversation history for this chat
      const history = await getConversationHistory(chatId, 5);
      
      // Build context-aware prompt
      const prompt = buildContextPrompt(history, userText);

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
          prompt: prompt,
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

      try {
        await saveConversation(chatId, userText, generatedResponse);
      } catch (error) {
        console.error("Unable to save Telegram conversation:", error);
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
