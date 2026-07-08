import { createServerFn } from "@tanstack/react-start";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function authHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY is not configured");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": TELEGRAM_API_KEY,
    "Content-Type": "application/json",
  };
}

export const sendTelegramMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { chatId: number | string; text: string }) => input)
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        chat_id: data.chatId,
        text: data.text,
        parse_mode: "HTML",
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed [${res.status}]: ${JSON.stringify(body)}`);
    }
    return { ok: true, messageId: body.result?.message_id };
  });

export interface BotUser {
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export const getBotUsers = createServerFn({ method: "GET" }).handler(async () => {
  const res = await fetch(`${GATEWAY_URL}/getUpdates`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ limit: 100, allowed_updates: ["message"] }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Telegram getUpdates failed [${res.status}]: ${JSON.stringify(body)}`);
  }
  const seen = new Map<number, BotUser>();
  for (const u of body.result ?? []) {
    const m = u.message ?? u.edited_message;
    const chat = m?.chat;
    if (chat?.id && chat.type === "private" && !seen.has(chat.id)) {
      seen.set(chat.id, {
        chatId: chat.id,
        username: chat.username,
        firstName: chat.first_name,
        lastName: chat.last_name,
      });
    }
  }
  return { users: Array.from(seen.values()) };
});
