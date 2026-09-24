// Issues a presigned PUT so the browser uploads straight to R2 (ADR 0011, decision 4).
//
// The row is created first, in PENDING: the key has to exist in the database before it
// exists in the bucket, otherwise an upload that is never confirmed leaves an object
// nobody can find to delete.
import { z } from 'zod';
import { authorizePhotoAccess, auditPhoto, encounterInTenant } from '@/lib/photo-access';
import { withTenant } from '@/lib/db';
import { buildPhotoKey, PHOTO_CONTENT_TYPE } from '@/lib/photo-key';
import { signUpload, storageConfigured } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const schema = z.object({
  encounterId: z.string().uuid(),
  framing: z.enum(['FRONT', 'LEFT_PROFILE', 'RIGHT_PROFILE', 'UPPER_THIRD']),
});

export async function POST(request: Request) {
  const access = await authorizePhotoAccess();
  if (!access.ok) {
    return Response.json({ error: access.message }, { status: access.status });
  }
  if (access.masked) {
    return Response.json(
      { error: 'Sessão assumida pela plataforma não envia fotos.' },
      { status: 403 },
    );
  }
  // Validate before reporting an environment problem: a malformed request is the
  // caller's mistake, and saying "storage unavailable" would send them looking in the
  // wrong place. Both checks are side-effect free, so the order is purely about which
  // answer is more useful.
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (!storageConfigured()) {
    return Response.json(
      { error: 'O armazenamento de fotos não está configurado nesta instalação.' },
      { status: 503 },
    );
  }

  const encounter = await encounterInTenant(access.tenant.id, parsed.data.encounterId);
  if (!encounter) {
    // Either it does not exist or it belongs to another clinic; the caller learns neither.
    return Response.json({ error: 'Atendimento não encontrado.' }, { status: 404 });
  }

  const key = buildPhotoKey({
    tenantId: access.tenant.id,
    patientId: encounter.patientId,
    encounterId: encounter.id,
    framing: parsed.data.framing,
  });

  const photo = await withTenant(access.tenant.id, (tx) =>
    tx.clinicalPhoto.create({
      data: {
        tenantId: access.tenant.id,
        encounterId: encounter.id,
        patientId: encounter.patientId,
        framing: parsed.data.framing,
        objectKey: key,
        status: 'PENDING',
        uploadedByUserId: access.session.userId,
      },
      select: { id: true },
    }),
  );

  const { url, expiresIn } = await signUpload(key, PHOTO_CONTENT_TYPE);

  await auditPhoto('photo.upload', {
    tenantId: access.tenant.id,
    userId: access.session.userId,
    photoId: photo.id,
    details: { framing: parsed.data.framing, encounterId: encounter.id },
  });

  return Response.json(
    { photoId: photo.id, uploadUrl: url, expiresIn, contentType: PHOTO_CONTENT_TYPE },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
