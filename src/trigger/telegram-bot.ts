import { task } from "@trigger.dev/sdk/v3";
import { appendFile, mkdir, readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "nomic-embed-text";
const conversationLogPath = resolve(
  process.env.CONVERSATION_LOG_PATH ?? "conversations/telegram-conversations.jsonl",
);
const conversationTranscriptPath = resolve(
  process.env.CONVERSATION_TRANSCRIPT_PATH ?? "conversations/telegram-conversations.txt",
);

if (!TELEGRAM_TOKEN) {
  throw new Error("TELEGRAM_TOKEN is not configured.");
}

interface ConversationEntry {
  timestamp: string;
  chatId: number;
  userText: string;
  generatedResponse: string;
}

interface EmbeddingResponse {
  embedding: number[];
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

/**
 * Get ALL conversation history for a specific chat (for RAG)
 */
async function getAllConversationHistory(chatId: number): Promise<ConversationEntry[]> {
  try {
    await access(conversationLogPath);
    const content = await readFile(conversationLogPath, "utf8");
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    const entries: ConversationEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as ConversationEntry;
        if (entry.chatId === chatId) {
          entries.push(entry);
        }
      } catch {
        // Skip invalid lines
      }
    }
    
    return entries;
  } catch (error) {
    return [];
  }
}

/**
 * Get embeddings from Ollama for semantic search
 */
async function getEmbedding(text: string, ollamaUrl: string): Promise<number[]> {
  const response = await fetch(ollamaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  return data.embedding;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length && i < b.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Perform RAG: find relevant past conversations using semantic search
 */
async function performRAG(
  currentMessage: string,
  chatId: number,
  ollamaUrl: string,
  maxResults: number = 3
): Promise<{ relevantHistory: ConversationEntry[]; similarityScores: number[] }> {
  const allHistory = await getAllConversationHistory(chatId);
  
  if (allHistory.length === 0) {
    return { relevantHistory: [], similarityScores: [] };
  }
  
  // Get embedding for current message
  const currentEmbedding = await getEmbedding(currentMessage, ollamaUrl);
  
  // Calculate similarity for each conversation entry
  const similarities = allHistory.map(entry => {
    const combinedText = `${entry.userText} ${entry.generatedResponse}`;
    const entryEmbedding = getEmbeddingSync(combinedText);
    return {
      entry,
      score: cosineSimilarity(currentEmbedding, entryEmbedding),
    };
  });
  
  // Sort by similarity and take top results
  similarities.sort((a, b) => b.score - a.score);
  const topResults = similarities.slice(0, maxResults);
  
  return {
    relevantHistory: topResults.map(r => r.entry),
    similarityScores: topResults.map(r => r.score),
  };
}

/**
 * Simple hash-based embedding for demonstration
 * In production, use actual embeddings from Ollama
 */
function getEmbeddingSync(text: string): number[] {
  const hash = Array.from({ length: 384 }, (_, i) => {
    const charCode = text.charCodeAt(i % text.length);
    return (charCode + i) % 1000 / 1000;
  });
  return hash;
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

/**
 * Build RAG-enhanced prompt with relevant past conversations
 */
function buildRAGPrompt(
  currentMessage: string,
  relevantHistory: ConversationEntry[],
  allHistory: ConversationEntry[]
): string {
  let context = "You are a helpful teacher. You have access to past conversation history for context.\n\n";
  
  if (relevantHistory.length > 0) {
    context += "=== RELEVANT PAST CONVERSATIONS (most similar to current query) ===\n\n";
    for (const entry of relevantHistory) {
      context += `Student: ${entry.userText}\n`;
      context += `Teacher: ${entry.generatedResponse}\n\n`;
    }
  }
  
  if (allHistory.length > relevantHistory.length) {
    context += "=== RECENT CONVERSATION HISTORY ===\n\n";
    const recentHistory = allHistory.slice(-5);
    for (const entry of recentHistory) {
      context += `Student: ${entry.userText}\n`;
      context += `Teacher: ${entry.generatedResponse}\n\n`;
    }
  }
  
  context += `=== CURRENT MESSAGE ===\n\n`;
  context += `Student: ${currentMessage}\n\n`;
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
      // Get Ollama URL
      const ollamaUrl = process.env.USE_REMOTE_OLLAMA === "true" && process.env.OLLAMA_REMOTE_URL
        ? process.env.OLLAMA_REMOTE_URL
        : process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";

      // Get ALL conversation history for RAG
      const allHistory = await getAllConversationHistory(chatId);
      
      // Perform RAG to find relevant past conversations
      const ragResults = await performRAG(userText, chatId, ollamaUrl, 3);
      
      // Build RAG-enhanced prompt
      const prompt = buildRAGPrompt(userText, ragResults.relevantHistory, allHistory);

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
        rag: {
          totalHistory: allHistory.length,
          relevantFound: ragResults.relevantHistory.length,
          similarityScores: ragResults.similarityScores,
        },
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
