import "server-only";

export type Button = { text: string; callback_data?: string; url?: string };

export function telegramConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Telegram user IDs allowed to press Approve / Reject. */
export function isTelegramAdmin(userId: number) {
  return (process.env.TELEGRAM_ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(String(userId));
}

/** Escapes text for Telegram's HTML parse mode. */
export function esc(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

const keyboard = (rows?: Button[][]) => (rows?.length ? { inline_keyboard: rows } : undefined);

/** Sends an HTML message to the HQ group and returns its message ID. */
export async function sendMessage(html: string, buttons?: Button[][]) {
  const msg = await call<{ message_id: number }>("sendMessage", {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: html.slice(0, 4096),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard(buttons),
  });
  return msg.message_id;
}

/** Replaces a message's text and buttons (pass no buttons to remove them). */
export async function editMessage(messageId: number, html: string, buttons?: Button[][]) {
  await call("editMessageText", {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    message_id: messageId,
    text: html.slice(0, 4096),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard(buttons) ?? { inline_keyboard: [] },
  });
}

/**
 * Acknowledges a button press; `text` shows as a small toast to whoever pressed it.
 * Never throws: the action already happened, and Telegram rejects stale presses.
 */
export async function answerCallback(callbackId: string, text?: string) {
  await call("answerCallbackQuery", { callback_query_id: callbackId, text }).catch((e) =>
    console.error("[telegram] answerCallback:", (e as Error).message),
  );
}
