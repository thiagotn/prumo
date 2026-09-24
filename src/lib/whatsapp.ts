// WhatsApp Cloud API: the only place that talks to Meta.
//
// Configuration is four variables and nothing else:
//   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN   (secret prumo-whatsapp)
//   WHATSAPP_APP_SECRET                        (verifies the inbound webhook)
//   WHATSAPP_VERIFY_TOKEN                      (the one-off subscription handshake)
//
// Absent, `config()` returns null and the rest of the system keeps working: the queue
// fills up and waits, and the Mensagens screen says the channel is not connected. The
// same posture as R2 in storage.ts — development and CI have no provider, and nothing
// should break there.
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type WhatsappConfig = {
  phoneNumberId: string;
  token: string;
  appSecret: string | null;
  verifyToken: string | null;
  apiVersion: string;
};

export function whatsappConfig(): WhatsappConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) return null;

  return {
    phoneNumberId,
    token,
    appSecret: process.env.WHATSAPP_APP_SECRET ?? null,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? null,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
  };
}

export function whatsappConfigured(): boolean {
  return whatsappConfig() !== null;
}

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

/**
 * Sends a plain text message.
 *
 * Outside a 24-hour window from the patient's last message, Meta only delivers approved
 * templates; a free-form send is refused with an error we keep verbatim, because that is
 * a configuration matter for whoever set the channel up, not something to retry.
 */
export async function sendText(to: string, body: string): Promise<SendResult> {
  const config = whatsappConfig();
  if (!config) return { ok: false, error: 'WhatsApp não configurado.', retryable: true };

  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body },
        }),
      },
    );
  } catch (error) {
    // The network, not the message: worth another attempt later.
    return { ok: false, error: `Falha de rede: ${(error as Error).message}`, retryable: true };
  }

  const payload = (await response.json().catch(() => null)) as
    | { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } }
    | null;

  if (!response.ok) {
    const message = payload?.error?.message ?? `HTTP ${response.status}`;
    // 4xx is about this message; 5xx and 429 are about the moment.
    const retryable = response.status >= 500 || response.status === 429;
    return { ok: false, error: message, retryable };
  }

  return { ok: true, providerMessageId: payload?.messages?.[0]?.id ?? null };
}

/**
 * Verifies the `X-Hub-Signature-256` header Meta sends with every webhook.
 *
 * Without this anyone who finds the URL can confirm and cancel appointments. Compared in
 * constant time, over the RAW body — re-serialising the JSON first would change a byte
 * somewhere and the signature would never match.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  // Deliberately independent of the sending credentials: answering patients and sending
  // messages are two different permissions, and a clinic may well have the webhook wired
  // before the number is approved.
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;
  if (!header?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export type InboundMessage = {
  /** The sender, as the provider gives it: digits, no plus. */
  from: string;
  text: string;
  providerMessageId: string | null;
};

/**
 * Pulls the text messages out of a webhook payload.
 *
 * Meta nests them three levels deep and sends delivery receipts through the same hook;
 * anything that is not an inbound text is ignored rather than guessed at.
 */
export function parseInbound(payload: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return messages;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[] } })?.value;
      if (!Array.isArray(value?.messages)) continue;
      for (const message of value.messages) {
        const typed = message as {
          from?: string;
          id?: string;
          type?: string;
          text?: { body?: string };
        };
        if (typed.type !== 'text' || !typed.from || !typed.text?.body) continue;
        messages.push({
          from: typed.from,
          text: typed.text.body,
          providerMessageId: typed.id ?? null,
        });
      }
    }
  }
  return messages;
}
