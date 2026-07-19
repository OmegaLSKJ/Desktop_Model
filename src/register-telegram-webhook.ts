async function main() {
  const token = process.env.TELEGRAM_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !webhookUrl || !webhookSecret) {
    throw new Error(
      "TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_URL, and TELEGRAM_WEBHOOK_SECRET must be configured.",
    );
  }

  if (!webhookUrl.startsWith("https://")) {
    throw new Error("TELEGRAM_WEBHOOK_URL must begin with https://.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ["message"],
    }),
  });

  const result: unknown = await response.json();

  if (
    !response.ok ||
    typeof result !== "object" ||
    result === null ||
    !("ok" in result) ||
    result.ok !== true
  ) {
    throw new Error(`Telegram setWebhook failed with status ${response.status}.`);
  }

  console.log("Telegram webhook registered successfully.");
}

void main();
