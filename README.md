# MyClassBot

MyClassBot is a Telegram bot that sends each incoming message to a local Ollama model and replies in the Telegram chat. Trigger.dev runs the reply task, while a small local HTTP server receives Telegram webhooks.

It can run on macOS, Windows, or Linux. The services below must run on the same device when using a local Ollama model.

## How it works

```text
Telegram -> public HTTPS tunnel -> local webhook server -> Trigger.dev task -> local Ollama -> Telegram reply
```

Telegram cannot call `localhost` directly, so the webhook server must be exposed through a public HTTPS tunnel.

## Requirements

Install the following on the device that will run the bot:

- [Node.js](https://nodejs.org/) 20 or later (the current LTS release is recommended)
- [Ollama](https://ollama.com/)
- A public HTTPS tunnel, such as [ngrok](https://ngrok.com/)
- A Telegram account and bot token from [@BotFather](https://t.me/BotFather)
- A Trigger.dev account and project API key

The default `gpt-oss:20b` model is large. If the device does not have enough memory/storage, install a smaller Ollama model and set `OLLAMA_MODEL` to its exact name instead.

## 1. Get the code and install dependencies

Open Terminal (macOS/Linux) or PowerShell (Windows), then run:

```bash
git clone <your-repository-url>
cd MyClassBot
npm install
```

If you copied the project instead of cloning it, open a terminal in the project folder and run only:

```bash
npm install
```

## 2. Install and start Ollama

Install Ollama for your operating system from [ollama.com](https://ollama.com/), then download the model:

```bash
ollama pull gpt-oss:20b
```

Verify it is installed:

```bash
ollama list
```

Ollama normally starts automatically after installation. If it is not running, start it with:

```bash
ollama serve
```

Leave that terminal open if your operating system does not run Ollama as a background service.

## 3. Create the Telegram bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Run `/newbot` and complete the prompts.
3. Copy the bot token BotFather provides. Treat it like a password.

## 4. Create and configure a Trigger.dev project

1. Create a project in the [Trigger.dev dashboard](https://cloud.trigger.dev/).
2. Create a development API key for that project.
3. Copy the key; it normally begins with `tr_dev_`.

The project ID in `trigger.config.ts` must belong to the same Trigger.dev project as `TRIGGER_SECRET_KEY`. Update it if you use a different project.

## 5. Configure environment variables

Create a local environment file from the template:

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` and provide values for the following settings:

```dotenv
TELEGRAM_TOKEN=your-token-from-botfather
TELEGRAM_WEBHOOK_SECRET=a-long-random-secret
TELEGRAM_WEBHOOK_URL=https://your-public-tunnel-url/telegram/webhook
TRIGGER_SECRET_KEY=your-trigger-development-key
OLLAMA_URL=http://127.0.0.1:11434/api/generate
OLLAMA_MODEL=gpt-oss:20b
PORT=3000
```

Generate a strong webhook secret with one of these commands:

macOS/Linux:

```bash
openssl rand -hex 32
```

Windows PowerShell:

```powershell
[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

`OLLAMA_MODEL` must exactly match a model shown by `ollama list`.

## 6. Start a public HTTPS tunnel

Telegram requires a publicly reachable HTTPS URL. With ngrok installed and authenticated, run:

```bash
ngrok http 3000
```

ngrok displays an HTTPS forwarding URL such as `https://example.ngrok-free.app`. Copy it and set this value in `.env`:

```dotenv
TELEGRAM_WEBHOOK_URL=https://example.ngrok-free.app/telegram/webhook
```

Keep ngrok running. Free tunnel URLs usually change when ngrok restarts, in which case update `.env` and register the webhook again.

## 7. Start the bot

Open three terminals in the project folder. Keep all three processes running.

Terminal 1 — Trigger.dev worker:

```bash
npm run dev:trigger
```

Terminal 2 — local Telegram webhook receiver:

```bash
npm run dev:webhook
```

Terminal 3 — ngrok tunnel:

```bash
ngrok http 3000
```

After the tunnel is live and `TELEGRAM_WEBHOOK_URL` is correct, register the webhook once:

```bash
npm run register:webhook
```

Open your Telegram bot chat, press **Start**, and send a message. The bot should reply after the Trigger.dev task completes.

## Changing the model

Download the model with Ollama, then set its exact name in `.env` and restart the Trigger.dev worker:

```bash
ollama pull <model-name>
```

```dotenv
OLLAMA_MODEL=<model-name>
```

For example, the default configuration uses:

```dotenv
OLLAMA_MODEL=gpt-oss:20b
```

## Troubleshooting

### Telegram reports `502 Bad Gateway`

The HTTPS tunnel cannot reach the local webhook server. Confirm all of the following:

- `npm run dev:webhook` is still running and says it is listening on port 3000.
- ngrok is still running and forwarding to port 3000.
- `TELEGRAM_WEBHOOK_URL` contains the current ngrok HTTPS URL followed by `/telegram/webhook`.
- Run `npm run register:webhook` again after changing the tunnel URL.

### The bot accepts messages but does not reply

- Ensure `npm run dev:trigger` is running without errors.
- Ensure Ollama is running and `ollama list` includes the value of `OLLAMA_MODEL`.
- Check the Trigger.dev terminal for task errors.

If Trigger.dev fails with an error mentioning `.trigger/tmp/store`, stop the worker, remove its disposable local cache, and start it again:

macOS/Linux:

```bash
rm -rf .trigger
npm run dev:trigger
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force .trigger
npm run dev:trigger
```

### Telegram returns `401 Unauthorized`

`TELEGRAM_WEBHOOK_SECRET` does not match the secret registered with Telegram. Check `.env` and run `npm run register:webhook` again.

### Ollama connection fails

Make sure Ollama is running on the same device and that `.env` contains:

```dotenv
OLLAMA_URL=http://127.0.0.1:11434/api/generate
```

## Security and deployment notes

- Never commit `.env`, bot tokens, Trigger keys, or webhook secrets. The supplied `.gitignore` excludes `.env` files.
- If a token is exposed, revoke/regenerate it immediately in BotFather or Trigger.dev and update `.env`.
- This project is designed for local development: a Trigger.dev Cloud worker cannot reach `127.0.0.1` on your device. To deploy it permanently, host Ollama on a network-accessible server (with authentication) or move the model inference to a hosted provider.
- For a reliable always-on bot, run the webhook receiver, Trigger worker, Ollama, and tunnel as managed services on a device/server that remains online.
