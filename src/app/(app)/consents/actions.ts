'use server';

// Consent terms, from the clinic's side: writing an edition, issuing a term to a patient,
// collecting the signature at the counter, and re-issuing the link when it expires.
//
// Signing from the patient's side lives in src/app/consent/[token]/actions.ts, because it
// happens without a session.
import { ConsentStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit, requestContext } from '@/lib/audit';
import { requireModuleWrite, requireOwnerOf } from '@/lib/auth/guards';
import { hashToken } from '@/lib/auth/session';
import {
  consentDateLabel,
  consentHash,
  decodeSignaturePng,
  fillConsentBody,
  linkExpiresAt,
  slugifyTitle,
} from '@/lib/consent';
import { withTenant } from '@/lib/db';
import { canonicalHost, originFor, requestHost } from '@/lib/tenant';

export type ConsentFormState = { error?: string; values?: Record<string, string> };

// ─────────────────────────────────────────────────────────────────────────────
// Editions of a term
// ─────────────────────────────────────────────────────────────────────────────

const templateSchema = z.object({
  /** Absent when writing the first edition of a new term. */
  slug: z.string().trim().max(60).default(''),
  title: z.string().trim().min(5, 'Dê um título ao termo.').max(140, 'O título ficou longo demais.'),
  body: z
    .string()
    .trim()
    .min(40, 'O texto do termo está curto demais para valer como consentimento.')
    .max(20_000, 'O texto ficou longo demais.'),
  procedureId: z.string().uuid().optional(),
});

/**
 * Writes an edition. The first one creates the term; every later one is a NEW row with
 * the version bumped — editing in place would rewrite what patients already signed.
 */
export async function saveTemplate(
  _previous: ConsentFormState,
  formData: FormData,
): Promise<ConsentFormState> {
  // The wording of a consent term is the doctor's decision, not the front desk's.
  const { tenant, session } = await requireOwnerOf('consents');

  const text = (field: string) => String(formData.get(field) ?? '');
  const values = { slug: text('slug'), title: text('title'), body: text('body'), procedureId: text('procedureId') };
  const fail = (error: string): ConsentFormState => ({ error, values });

  if (!tenant) return fail('Esta tela pertence a uma clínica.');

  const parsed = templateSchema.safeParse({ ...values, procedureId: values.procedureId || undefined });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const input = parsed.data;

  const slug = input.slug || slugifyTitle(input.title);
  if (!slug) return fail('O título precisa ter letras ou números.');

  let template;
  try {
    template = await withTenant(tenant.id, async (tx) => {
      const previous = await tx.consentTemplate.findFirst({
        where: { slug },
        orderBy: { version: 'desc' },
      });

      // The current edition steps down first: a partial unique index allows only one.
      if (previous?.current) {
        await tx.consentTemplate.update({ where: { id: previous.id }, data: { current: false } });
      }

      return tx.consentTemplate.create({
        data: {
          tenantId: tenant.id,
          slug,
          title: input.title,
          body: input.body,
          version: (previous?.version ?? 0) + 1,
          current: true,
          procedureId: input.procedureId ?? null,
          createdByUserId: session.userId,
        },
      });
    });
  } catch (error) {
    // Two people publishing the same term at once both compute the same next version;
    // the unique index on (tenant, slug, version) lets exactly one through.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail('Outra edição deste termo acabou de ser publicada. Recarregue e tente de novo.');
    }
    throw error;
  }

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'consent.template.save',
    resource: 'consentTemplate',
    resourceId: template.id,
    details: { slug, version: template.version },
  });

  revalidatePath('/consents');
  redirect(`/consents?saved=template`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Issuing a term to a patient
// ─────────────────────────────────────────────────────────────────────────────

/** Mints a signing link: an opaque 256-bit token, of which only the HMAC is stored. */
function mintToken(): { token: string; tokenHash: string; tokenExpiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token), tokenExpiresAt: linkExpiresAt() };
}

const issueSchema = z.object({
  templateId: z.string().uuid('Escolha o termo.'),
  patientId: z.string().uuid('Escolha a paciente.'),
  appointmentId: z.string().uuid().optional(),
});

export async function issueConsent(
  _previous: ConsentFormState,
  formData: FormData,
): Promise<ConsentFormState> {
  const { tenant, session } = await requireModuleWrite('consents');
  const text = (field: string) => String(formData.get(field) ?? '');
  const values = {
    templateId: text('templateId'),
    patientId: text('patientId'),
    appointmentId: text('appointmentId'),
  };
  const fail = (error: string): ConsentFormState => ({ error, values });

  if (!tenant) return fail('Esta tela pertence a uma clínica.');

  const parsed = issueSchema.safeParse({
    ...values,
    appointmentId: values.appointmentId || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const input = parsed.data;

  const result = await withTenant(tenant.id, async (tx) => {
    const [template, patient] = await Promise.all([
      tx.consentTemplate.findUnique({ where: { id: input.templateId } }),
      tx.patient.findUnique({ where: { id: input.patientId } }),
    ]);
    if (!template) return { ok: false, error: 'Termo não encontrado.' } as const;
    if (!patient) return { ok: false, error: 'Paciente não encontrada.' } as const;

    const appointment = input.appointmentId
      ? await tx.appointment.findUnique({
          where: { id: input.appointmentId },
          include: { procedure: true },
        })
      : null;
    if (input.appointmentId && !appointment) {
      return { ok: false, error: 'Atendimento não encontrado.' } as const;
    }

    // The wording is filled in and frozen here. From now on this consent no longer
    // depends on the template, which is free to change.
    const body = fillConsentBody(template.body, {
      paciente: patient.name,
      procedimento: appointment?.procedure?.name ?? undefined,
      clinica: tenant.name,
      data: consentDateLabel(new Date()),
    });

    // No signing link yet: one is minted only when somebody asks for it, and it is
    // shown once. A link nobody asked for is a key left lying around.
    const consent = await tx.consent.create({
      data: {
        tenantId: tenant.id,
        templateId: template.id,
        patientId: patient.id,
        appointmentId: appointment?.id ?? null,
        titleSnapshot: template.title,
        bodySnapshot: body,
        templateVersion: template.version,
        createdByUserId: session.userId,
      },
    });
    return { ok: true, id: consent.id, version: template.version } as const;
  });

  if (!result.ok) return fail(result.error);

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'consent.issue',
    resource: 'consent',
    resourceId: result.id,
    details: { templateId: input.templateId, templateVersion: result.version },
  });

  revalidatePath('/consents');
  revalidatePath('/encounter');
  redirect(`/consents/${result.id}?issued=1`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Collecting the signature at the counter
// ─────────────────────────────────────────────────────────────────────────────

const signSchema = z.object({
  consentId: z.string().uuid(),
  signerName: z
    .string()
    .trim()
    .min(3, 'Escreva o nome de quem está assinando.')
    .max(120, 'O nome ficou longo demais.'),
  signerNote: z.string().trim().max(120).default(''),
  signature: z.string().min(1, 'Assine no quadro antes de confirmar.'),
});

export async function signOnScreen(
  _previous: ConsentFormState,
  formData: FormData,
): Promise<ConsentFormState> {
  const { tenant, session } = await requireModuleWrite('consents');
  const text = (field: string) => String(formData.get(field) ?? '');
  const values = { signerName: text('signerName'), signerNote: text('signerNote') };
  const fail = (error: string): ConsentFormState => ({ error, values });

  if (!tenant) return fail('Esta tela pertence a uma clínica.');

  const parsed = signSchema.safeParse({
    consentId: text('consentId'),
    signerName: values.signerName,
    signerNote: values.signerNote,
    signature: text('signature'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const input = parsed.data;

  const signature = decodeSignaturePng(input.signature);
  if (!signature.ok) return fail(signature.error);

  const { ip, userAgent } = await requestContext();

  const result = await withTenant(tenant.id, async (tx) => {
    const consent = await tx.consent.findUnique({ where: { id: input.consentId } });
    if (!consent) return { ok: false, error: 'Termo não encontrado.' } as const;
    if (consent.status !== ConsentStatus.PENDING) {
      return { ok: false, error: 'Este termo já foi assinado ou cancelado.' } as const;
    }

    const signedAt = new Date();
    const hash = consentHash({
      templateVersion: consent.templateVersion,
      title: consent.titleSnapshot,
      body: consent.bodySnapshot,
      signerName: input.signerName,
      signedAt,
      signature: signature.bytes,
    });

    // Conditioned on PENDING: two people confirming at once, one wins, the other is told.
    const changed = await tx.consent.updateMany({
      where: { id: consent.id, status: ConsentStatus.PENDING },
      data: {
        status: ConsentStatus.SIGNED,
        signedAt,
        signerName: input.signerName,
        signerNote: input.signerNote || null,
        // Copied into a plain Uint8Array: Prisma 7 types the Bytes column as one, and a
        // Node Buffer's ArrayBufferLike does not satisfy it.
        signatureImage: new Uint8Array(signature.bytes),
        signatureHash: hash,
        signedIp: ip,
        signedUserAgent: userAgent,
        collectedByUserId: session.userId,
        // The link stops working the moment the term is signed on screen.
        tokenHash: null,
        tokenExpiresAt: null,
      },
    });
    if (changed.count === 0) {
      return { ok: false, error: 'Este termo já foi assinado ou cancelado.' } as const;
    }
    return { ok: true, id: consent.id } as const;
  });

  if (!result.ok) return fail(result.error);

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'consent.sign',
    resource: 'consent',
    resourceId: result.id,
    details: { channel: 'screen' },
  });

  revalidatePath('/consents');
  revalidatePath(`/consents/${result.id}`);
  redirect(`/consents/${result.id}?signed=1`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Housekeeping
// ─────────────────────────────────────────────────────────────────────────────

export type LinkState = { error?: string; link?: string; expiresAt?: string };

/**
 * Mints the signing link and hands it back ONCE, to be shown on the screen and pasted
 * into a message.
 *
 * Only the HMAC of the token is stored, exactly like a session, so there is nothing to
 * read back later: asking for the link again mints a new one and the previous one stops
 * working. That is also the "Reenviar link" of the pending list — and it means a link
 * forwarded to the wrong person can be revoked by generating another.
 *
 * The plaintext never reaches a URL or the audit log, which is why this returns the link
 * instead of redirecting to it.
 */
export async function createSigningLink(
  _previous: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const { tenant, session } = await requireModuleWrite('consents');
  if (!tenant) return { error: 'Esta tela pertence a uma clínica.' };

  const id = String(formData.get('consentId') ?? '');
  if (!z.string().uuid().safeParse(id).success) return { error: 'Termo não encontrado.' };

  const link = mintToken();
  const changed = await withTenant(tenant.id, (tx) =>
    tx.consent.updateMany({
      where: { id, status: ConsentStatus.PENDING },
      data: { tokenHash: link.tokenHash, tokenExpiresAt: link.tokenExpiresAt },
    }),
  );
  if (changed.count === 0) {
    return { error: 'Este termo já foi assinado ou cancelado.' };
  }

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'consent.issue',
    resource: 'consent.link',
    resourceId: id,
    // The token itself is never written down: the log is proof of the event, not a copy
    // of the key.
    details: { expiresAt: link.tokenExpiresAt.toISOString() },
  });

  // The clinic's own address, not whichever of its hostnames the reception happens to be
  // browsing: this link goes to a patient, and she should see the clinic she knows.
  const from = await requestHost();
  const host = (await canonicalHost(tenant.id, from)) ?? from;

  revalidatePath(`/consents/${id}`);
  revalidatePath('/consents');
  return {
    link: `${originFor(host)}/consent/${link.token}`,
    expiresAt: link.tokenExpiresAt.toISOString(),
  };
}

export async function cancelConsent(formData: FormData): Promise<void> {
  const { tenant, session } = await requireModuleWrite('consents');
  if (!tenant) return;

  const id = String(formData.get('consentId') ?? '');
  if (!z.string().uuid().safeParse(id).success) return;

  await withTenant(tenant.id, (tx) =>
    tx.consent.updateMany({
      where: { id, status: ConsentStatus.PENDING },
      // Cancelling kills the link too: a term nobody should sign must not be signable.
      data: { status: ConsentStatus.CANCELLED, tokenHash: null, tokenExpiresAt: null },
    }),
  );

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'consent.cancel',
    resource: 'consent',
    resourceId: id,
  });

  revalidatePath('/consents');
  redirect('/consents?cancelled=1');
}
