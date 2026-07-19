# MyClassBot 🤖

A Telegram bot that forwards messages to a local Ollama LLM and returns responses. Built with [Trigger.dev](https://trigger.dev) for task orchestration.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 📋 Table of Contents

1. [What is MyClassBot?](#what-is-myclassbot)
2. [How It Works](#how-it-works)
3. [Before You Begin](#before-you-begin)
4. [Step-by-Step Setup](#step-by-step-setup)
5. [Configuration](#configuration)
6. [Running the Bot](#running-the-bot)
7. [Changing Models](#changing-models)
8. [Troubleshooting](#troubleshooting)
9. [Security Notes](#security-notes)

---

## What is MyClassBot?

MyClassBot is a Telegram bot that:
- Receives messages from your Telegram chat
- Sends them to a local Ollama AI model
- Returns the AI's response back to your chat
- Logs all conversations for later review

**Perfect for:** Learning, tutoring, coding assistance, or just chatting with an AI.

---

## How It Works

```
Telegram → HTTPS Tunnel → Local Webhook → Trigger.dev → Ollama → Telegram
```

**Why the tunnel?** Telegram needs a public URL to send messages. Since your computer is local, we use ngrok to create a temporary public address.

---

## Before You Begin

### ✅ Required Accounts & Tools

| Item | How to Get It |
|------|---------------|
| **Node.js 20+** | Download from [nodejs.org](https://nodejs.org/) |
| **Ollama** | Download from [ollama.com](https://ollama.com/) |
| **ngrok** | Download from [ngrok.com](https://ngrok.com/) |
| **Telegram Bot Token** | Message [@BotFather](https://t.me/BotFather) → `/newbot` |
| **Trigger.dev Account** | Sign up at [trigger.dev](https://trigger.dev) |

### ⚠️ Important Notes

- **Memory:** The default model (`qwen2.5:7b`) needs ~8GB RAM. Use a smaller model if needed.
- **All services must run on the same computer** when using local Ollama.
- **ngrok URLs change** when you restart, so update your webhook if needed.

---

## Step-by-Step Setup

### Step 1: Get the Code

**Option A - Clone (Recommended)**
```bash
git clone <your-repository-url>
cd MyClassBot
```

**Option B - Copy Files**
- Download the project files
- Open PowerShell/Terminal in the project folder

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Install Ollama and Download a Model

1. Install Ollama from [ollama.com](https://ollama.com/)
2. Download the AI model:
   ```bash
   ollama pull qwen2.5:7b
   ```
3. Verify installation:
   ```bash
   ollama list
   ```

### Step 4: Start Ollama

**Ollama must be running before starting the bot.**

```bash
# macOS/Linux
ollama serve

# Windows PowerShell
ollama serve
```

Leave this terminal running or let Ollama run as a background service (it usually starts automatically after installation).

> **Tip:** If Ollama is already running, you can skip this step. Check with `ollama list` to confirm.

### Step 5: Create Your Telegram Bot

1. Open Telegram on your phone/computer
2. Search for **@BotFather**
3. Send the message: `/newbot`
4. Follow the prompts to name your bot
5. **Copy the token** BotFather sends you - you'll need it in Step 7

### Step 6: Set Up Trigger.dev

1. Go to [Trigger.dev dashboard](https://cloud.trigger.dev/)
2. Create a new project (or use an existing one)
3. Go to **Settings → API Keys**
4. Create a **Development API Key**
5. Copy the key (it starts with `tr_dev_`)

### Step 7: Configure Environment Variables

1. Copy the example file:
   ```bash
   # macOS/Linux
   cp .env.example .env
   
   # Windows PowerShell
   Copy-Item .env.example .env
   ```

2. Open `.env` in a text editor and fill in your values:

   ```dotenv
   # ──────────────────────────────────────────────────────────────
   # TELEGRAM SETTINGS
   # ──────────────────────────────────────────────────────────────
   TELEGRAM_TOKEN=your-bot-token-from-botfather-here
   
   # ──────────────────────────────────────────────────────────────
   # SECURITY - Generate these with the commands below
   # ──────────────────────────────────────────────────────────────
   TELEGRAM_WEBHOOK_SECRET=your-random-hex-string-here
   TELEGRAM_WEBHOOK_URL=https://your-ngrok-url.telegram/webhook
   
   # ──────────────────────────────────────────────────────────────
   # TRIGGER.DEV SETTINGS
   # ──────────────────────────────────────────────────────────────
   TRIGGER_SECRET_KEY=your-trigger-dev-key-here
   
   # ──────────────────────────────────────────────────────────────
   # OLLAMA SETTINGS
   # ──────────────────────────────────────────────────────────────
   OLLAMA_URL=http://127.0.0.1:11434/api/generate
   OLLAMA_MODEL=qwen2.5:7b
   
   # ──────────────────────────────────────────────────────────────
   # LOGGING (optional)
   # ──────────────────────────────────────────────────────────────
   CONVERSATION_LOG_PATH=conversations/telegram-conversations.jsonl
   CONVERSATION_TRANSCRIPT_PATH=conversations/telegram-conversations.txt
   
   # ──────────────────────────────────────────────────────────────
   # SERVER SETTINGS (usually don't need to change)
   # ──────────────────────────────────────────────────────────────
   PORT=3000
   ```

3. **Generate secure secrets:**
   ```bash
   # macOS/Linux
   openssl rand -hex 32
   
   # Windows PowerShell
   [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
   ```
   Copy the output and paste it for `TELEGRAM_WEBHOOK_SECRET`.

---

## Available npm Scripts

| Script | Description |
|--------|-------------|
| `npm run setup` | Install dependencies and download the default model |
| `npm run start:ollama` | Start the Ollama server |
| `npm run dev:trigger` | Start Trigger.dev worker |
| `npm run dev:webhook` | Start local webhook server |
| `npm run register:webhook` | Register webhook with Telegram |
| `npm run start` | Start all services together (trigger + webhook + ngrok) |

---

## Running the Bot

### Step 8: Start ngrok (Get Your Public URL)

Open a terminal and run:
```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding: https://abc123.ngrok-free.app -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123.ngrok-free.app`).

### Step 9: Update Your Webhook URL

1. Open `.env`
2. Update `TELEGRAM_WEBHOOK_URL`:
   ```dotenv
   TELEGRAM_WEBHOOK_URL=https://abc123.ngrok-free.app/telegram/webhook
   ```

### Step 10: Register the Webhook with Telegram

```bash
npm run register:webhook
```

You should see: `Webhook registered successfully`

### Step 11: Start All Services

**Option A - Combined (Recommended):**

```bash
npm run start
```

This starts all three services in one command using `concurrently`.

**Option B - Separate Terminals:**

Open **three separate terminals** in the project folder:

| Terminal | Command | What It Does |
|----------|---------|--------------|
| **Terminal 1** | `npm run dev:trigger` | Runs the AI task worker |
| **Terminal 2** | `npm run dev:webhook` | Listens for Telegram messages |
| **Terminal 3** | `ngrok http 3000` | Creates public URL (keep running) |

**Keep all three running!**

### Step 12: Test Your Bot

1. Open Telegram
2. Find your bot (search by the name you gave it in Step 5)
3. Tap **Start**
4. Send any message (e.g., "Hello!")
5. Wait a few seconds for the response

---

## Changing Models

Want to use a different AI model?

1. Pull the new model:
   ```bash
   ollama pull <model-name>
   ```
   Examples: `llama3.2:1b`, `phi3:latest`, `mistral:7b`

2. Update `.env`:
   ```dotenv
   OLLAMA_MODEL=<model-name>
   ```

3. Restart the Trigger.dev worker (Terminal 1):
   - Press `Ctrl+C` to stop
   - Run `npm run dev:trigger` again

---

## Troubleshooting

### ❌ "502 Bad Gateway" Error

Telegram can't reach your webhook. Check:

1. ✅ Is `npm run dev:webhook` running? (Terminal 2)
2. ✅ Is ngrok running? (Terminal 3)
3. ✅ Does `TELEGRAM_WEBHOOK_URL` match the ngrok URL?
4. ✅ Did you re-run `npm run register:webhook` after changing URLs?

### ❌ Bot Doesn't Reply

1. Check Trigger.dev worker (Terminal 1) - any error messages?
2. Run `ollama list` - is your model listed?
3. Is Ollama running? Run `ollama serve` if not.

### ❌ "401 Unauthorized" Error

Your webhook secret is wrong:

1. Generate a new secret:
   ```bash
   openssl rand -hex 32
   ```
2. Update `TELEGRAM_WEBHOOK_SECRET` in `.env`
3. Re-register the webhook:
   ```bash
   npm run register:webhook
   ```

### ❌ Trigger.dev Shows Cache Errors

Delete the cache folder:

```bash
# macOS/Linux
rm -rf .trigger

# Windows PowerShell
Remove-Item -Recurse -Force .trigger
```

Then restart Terminal 1: `npm run dev:trigger`

---

## Security Notes

- 🔒 **Never commit `.env`** - it contains secrets (already in `.gitignore`)
- 🔄 If you share your token or keys, **revoke them immediately** in BotFather or Trigger.dev
- 📡 This setup is for **local development only** - Trigger.dev Cloud can't reach your local Ollama

---

## Project Files

```
MyClassBot/
├── src/
│   ├── telegram-webhook.ts          # Handles incoming Telegram messages
│   ├── register-telegram-webhook.ts # Registers webhook with Telegram
│   └── trigger/
│       └── telegram-bot.ts          # Trigger.dev task that calls Ollama
├── conversations/                     # Auto-generated chat logs
├── trigger.config.ts                  # Trigger.dev project settings
├── package.json                       # Project dependencies
└── README.md                          # This file
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.
