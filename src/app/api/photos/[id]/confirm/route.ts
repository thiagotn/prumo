// Marks a photo ready, once R2 confirms the object actually arrived (ADR 0011, decision 4).
//
// HeadObject rather than trusting the browser: the presigned PUT pins the content type,
// but nothing guarantees the upload finished, and the size is only knowable afterwards.
import { authorizePhotoAccess, auditPhoto } from '@/lib/photo-access';
import { withTenant } from '@/lib/db';
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPE } from '@/lib/photo-key';
import { deleteObjects, headObject, storageConfigured } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await authorizePhotoAccess();
  if (!access.ok) return Response.json({ error: access.message }, { status: access.status });
  if (!storageConfigured()) {
    return Response.json({ error: 'Armazenamento não configurado.' }, { status: 503 });
  }

  const { id } = await context.params;

  // RLS already slices this to the tenant; a photo from another clinic simply is not here.
  const photo = await withTenant(access.tenant.id, (tx) =>
    tx.clinicalPhoto.findUnique({ where: { id }, select: { id: true, objectKey: true, status: true } }),
  );
  if (!photo) return Response.json({ error: 'Foto não encontrada.' }, { status: 404 });
  if (photo.status === 'READY') return Response.json({ status: 'READY' });
  if (photo.status === 'DELETED') {
    return Response.json({ error: 'Esta foto foi excluída.' }, { status: 410 });
  }

  const head = await headObject(photo.objectKey);
  if (!head) {
    return Response.json({ error: 'O upload não chegou. Tente de novo.' }, { status: 409 });
  }

  // Both checks end in the object being removed: an upload the server would not have
  // signed should not sit in the bucket waiting to be found later.
  if (head.contentType !== PHOTO_CONTENT_TYPE) {
    await deleteObjects([photo.objectKey]);
    await withTenant(access.tenant.id, (tx) =>
      tx.clinicalPhoto.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } }),
    );
    return Response.json(
      { error: `Formato inesperado (${head.contentType ?? 'desconhecido'}). Envie uma imagem WebP.` },
      { status: 415 },
    );
  }
  if (head.byteSize > MAX_PHOTO_BYTES) {
    await deleteObjects([photo.objectKey]);
    await withTenant(access.tenant.id, (tx) =>
      tx.clinicalPhoto.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } }),
    );
    return Response.json({ error: 'Arquivo grande demais.' }, { status: 413 });
  }

  await withTenant(access.tenant.id, (tx) =>
    tx.clinicalPhoto.update({
      where: { id },
      data: {
        status: 'READY',
        contentType: head.contentType,
        byteSize: head.byteSize,
        confirmedAt: new Date(),
      },
    }),
  );

  await auditPhoto('photo.upload', {
    tenantId: access.tenant.id,
    userId: access.session.userId,
    photoId: id,
    details: { confirmed: true, byteSize: head.byteSize },
  });

  return Response.json({ status: 'READY' }, { headers: { 'cache-control': 'private, no-store' } });
}
