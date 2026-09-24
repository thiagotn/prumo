import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseInbound, verifyWebhookSignature, whatsappConfigured } from './whatsapp';

const SECRET = 'test-app-secret';

describe('whatsappConfigured', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is false without credentials, so nothing breaks in development', () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    expect(whatsappConfigured()).toBe(false);
  });

  it('needs both the number and the token', () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    delete process.env.WHATSAPP_TOKEN;
    expect(whatsappConfigured()).toBe(false);

    process.env.WHATSAPP_TOKEN = 'abc';
    expect(whatsappConfigured()).toBe(true);
  });
});

describe('verifyWebhookSignature', () => {
  beforeEach(() => {
    // No sending credentials on purpose: the webhook is verified on its own secret, so a
    // clinic can answer patients before its number is approved.
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    process.env.WHATSAPP_APP_SECRET = SECRET;
  });

  const sign = (body: string, secret = SECRET) =>
    `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

  it('accepts a signature made with the app secret', () => {
    const body = JSON.stringify({ entry: [] });
    expect(verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it('refuses a signature from another secret, or over another body', () => {
    const body = JSON.stringify({ entry: [] });
    expect(verifyWebhookSignature(body, sign(body, 'wrong'))).toBe(false);
    expect(verifyWebhookSignature(`${body} `, sign(body))).toBe(false);
  });

  it('refuses a missing or malformed header', () => {
    const body = '{}';
    expect(verifyWebhookSignature(body, null)).toBe(false);
    expect(verifyWebhookSignature(body, 'nonsense')).toBe(false);
    expect(verifyWebhookSignature(body, 'sha256=zz')).toBe(false);
  });

  it('refuses everything when no app secret is configured', () => {
    // Anyone who finds the URL could otherwise confirm and cancel appointments.
    delete process.env.WHATSAPP_APP_SECRET;
    const body = '{}';
    expect(verifyWebhookSignature(body, sign(body))).toBe(false);
  });
});

describe('parseInbound', () => {
  const payload = (messages: unknown[]) => ({
    object: 'whatsapp_business_account',
    entry: [{ id: '1', changes: [{ field: 'messages', value: { messages } }] }],
  });

  it('pulls out the text messages', () => {
    const parsed = parseInbound(
      payload([
        { from: '5511987650001', id: 'wamid.1', type: 'text', text: { body: '1' } },
        { from: '5511987650002', id: 'wamid.2', type: 'text', text: { body: 'obrigada!' } },
      ]),
    );
    expect(parsed).toEqual([
      { from: '5511987650001', text: '1', providerMessageId: 'wamid.1' },
      { from: '5511987650002', text: 'obrigada!', providerMessageId: 'wamid.2' },
    ]);
  });

  it('ignores what is not an inbound text', () => {
    // Delivery receipts, images and audio arrive through the same hook.
    expect(
      parseInbound(
        payload([
          { from: '551', id: 'a', type: 'image', image: { id: 'x' } },
          { from: '551', id: 'b', type: 'text' },
        ]),
      ),
    ).toEqual([]);
    expect(parseInbound({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
  });

  it('survives a payload in a shape it has never seen', () => {
    expect(parseInbound(null)).toEqual([]);
    expect(parseInbound({})).toEqual([]);
    expect(parseInbound({ entry: 'nope' })).toEqual([]);
    expect(parseInbound({ entry: [{ changes: [{}] }] })).toEqual([]);
  });
});
