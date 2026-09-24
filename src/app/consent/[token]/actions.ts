'use server';

// Signing from the patient's side. No session here: what authorises this request is the
// token in the URL, and the clinic is the one the hostname resolves to — the same
// resolution every other screen uses.
import { ConsentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit, requestContext } from '@/lib/audit';
import { hashToken } from '@/lib/auth/session';
import { consentHash, decodeSignaturePng } from '@/lib/consent';
import { withTenant } from '@/lib/db';
import { currentTenant } from '@/lib/tenant';

export type SignByLinkState = { error?: string; values?: { signerName: string; signerNote: string } };

const schema = z.object({
  token: z.string().min(20).max(200),
  signerName: z
    .string()
    .trim()
    .min(3, 'Escreva seu nome completo.')
    .max(120, 'O nome ficou longo demais.'),
  signerNote: z.string().trim().max(120).default(''),
  signature: z.string().min(1, 'Assine no quadro antes de confirmar.'),
});

export async function signByLink(
  _previous: SignByLinkState,
  formData: FormData,
): Promise<SignByLinkState> {
  const text = (field: string) => String(formData.get(field) ?? '');
  const values = { signerName: text('signerName'), signerNote: text('signerNote') };
  const fail = (error: string): SignByLinkState => ({ error, values });

  const tenant = await currentTenant();
  if (!tenant || !tenant.active) return fail('Link inválido.');

  const parsed = schema.safeParse({
    token: text('token'),
    signerName: values.signerName,
    signerNote: values.signerNote,
    signature: text('signature'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const input = parsed.data;

  const signature = decodeSignaturePng(input.signature);
  if (!signature.ok) return fail(signature.error);

  const { ip, userAgent } = await requestContext();
  const tokenHash = hashToken(input.token);

  const result = await withTenant(tenant.id, async (tx) => {
    const consent = await tx.consent.findUnique({ where: { tokenHash } });
    // The same answer for a token that never existed and one that belongs to another
    // clinic: there is nothing to learn from the difference.
    if (!consent) return { ok: false, error: 'Link inválido.' } as const;
    if (consent.status !== ConsentStatus.PENDING) {
      return { ok: false, error: 'Este termo já foi assinado ou cancelado.' } as const;
    }
    if (!consent.tokenExpiresAt || consent.tokenExpiresAt < new Date()) {
      return { ok: false, error: 'Este link expirou. Peça um novo à clínica.' } as const;
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

    const changed = await tx.consent.updateMany({
      where: { id: consent.id, status: ConsentStatus.PENDING },
      data: {
        status: ConsentStatus.SIGNED,
        signedAt,
        signerName: input.signerName,
        signerNote: input.signerNote || null,
        signatureImage: new Uint8Array(signature.bytes),
        signatureHash: hash,
        signedIp: ip,
        signedUserAgent: userAgent,
        // The token stays: the patient downloads her own copy right after signing, and
        // the expiry still applies to that.
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
    // Nobody from the clinic is logged in: the signature is the patient's own act.
    userId: null,
    action: 'consent.sign',
    resource: 'consent',
    resourceId: result.id,
    details: { channel: 'link' },
  });

  revalidatePath('/consents');
  redirect(`/consent/${input.token}?signed=1`);
}
