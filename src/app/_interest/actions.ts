'use server';

// Taking in a contact request from the public form. No session: this is the one door in
// the system a stranger can knock on.
//
// Three things bound it. The POST is a Server Action, so Next checks the Origin against
// the Host and a form on someone else's page cannot submit here. `withLeadIntake` opens
// the narrowest scope in the codebase — it can insert a request and count the ones from
// its own IP, and RLS denies it everything else, including the audit log. And the caps in
// src/lib/leads.ts decide what one address may cost us in an hour.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requestContext } from '@/lib/audit';
import { withLeadIntake } from '@/lib/db';
import { INTEREST_FORM, readFormStamp } from '@/lib/lead-stamp';
import {
  LEAD_LIMITS,
  looksAutomated,
  normalizeLeadEmail,
  sanitizeLine,
  sanitizeMessage,
} from '@/lib/leads';
import { requestHost } from '@/lib/tenant';

export type InterestValues = {
  name: string;
  email: string;
  phone: string;
  clinic: string;
  message: string;
};

export type InterestState = { error?: string; sent?: boolean; values?: InterestValues };

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Escreva seu nome.')
    .max(LEAD_LIMITS.name, 'O nome ficou longo demais.'),
  email: z
    .string()
    .trim()
    .max(LEAD_LIMITS.email, 'O e-mail ficou longo demais.')
    .email('Informe um e-mail válido.'),
  phone: z.string().trim().max(LEAD_LIMITS.phone, 'O telefone ficou longo demais.').default(''),
  clinic: z.string().trim().max(LEAD_LIMITS.clinic, 'O nome da clínica ficou longo.').default(''),
  message: z
    .string()
    .trim()
    .max(LEAD_LIMITS.message, 'A mensagem passou do tamanho — resuma e conte o resto na conversa.')
    .default(''),
});

export async function registerInterest(
  _previous: InterestState,
  formData: FormData,
): Promise<InterestState> {
  const text = (field: string) => String(formData.get(field) ?? '');
  const values: InterestValues = {
    name: text('name'),
    email: text('email'),
    phone: text('phone'),
    clinic: text('clinic'),
    message: text('message'),
  };
  const fail = (error: string): InterestState => ({ error, values });

  // A robot gets the same thank-you a person gets, and nothing is written. Told it failed,
  // it would try another way; told it succeeded, it goes away.
  if (
    looksAutomated({
      honeypot: text('website'),
      issuedAt: readFormStamp(INTEREST_FORM, text('issuedAt'), text('signature')),
      now: Date.now(),
    })
  ) {
    return { sent: true };
  }

  const parsed = schema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Confira os dados.');
  const input = parsed.data;

  const host = await requestHost();
  const { ip, userAgent } = await requestContext();

  try {
    const accepted = await withLeadIntake(ip, async (tx) => {
      // No IP to count by — behind a proxy that strips it, or a direct call. The rate
      // limit Traefik applies to the Ingress is what is left, and it is enough.
      if (ip) {
        const now = Date.now();
        const [lastHour, lastDay] = await Promise.all([
          tx.interestLead.count({
            where: { ip, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
          }),
          tx.interestLead.count({
            where: { ip, createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } },
          }),
        ]);
        if (lastHour >= LEAD_LIMITS.perIpPerHour || lastDay >= LEAD_LIMITS.perIpPerDay) {
          return false;
        }
      }

      await tx.interestLead.create({
        data: {
          name: sanitizeLine(input.name),
          email: normalizeLeadEmail(input.email),
          phone: sanitizeLine(input.phone) || null,
          clinic: sanitizeLine(input.clinic) || null,
          message: sanitizeMessage(input.message) || null,
          ip,
          userAgent: userAgent ? userAgent.slice(0, 400) : null,
          host,
        },
      });
      return true;
    });

    if (!accepted) {
      // The anonymous path cannot write audit_log — it opens no scope that reaches it.
      // The application log is where a flood shows up.
      console.warn('[interest] over the per-IP cap', { ip, host });
      return fail(
        'Já recebemos vários pedidos deste endereço. Se foi você, tente novamente mais tarde.',
      );
    }
  } catch (error) {
    console.error('[interest] could not record the request', error);
    return fail('Não conseguimos registrar agora. Tente de novo em alguns minutos.');
  }

  revalidatePath('/leads');
  return { sent: true };
}
