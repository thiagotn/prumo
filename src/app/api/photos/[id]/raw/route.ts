// Serves a clinical photo (ADR 0011, decision 5).
//
// Authorise, write the access to audit_log, then 302 to a short-lived signed URL. The
// signed URL is never embedded in the HTML: in an <img src> it leaks into browser
// history and expires in the user's face. A redirect issued per view has neither problem,
// and gives us the one place where every read can be recorded.
import { authorizePhotoAccess, auditPhoto } from '@/lib/photo-access';
import { withTenant } from '@/lib/db';
import { keyBelongsToTenant } from '@/lib/photo-key';
import { signDownload, storageConfigured } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await authorizePhotoAccess();
  if (!access.ok) {
    return new Response(access.message, { status: access.status });
  }
  if (access.masked) {
    return new Response('Prontuário mascarado nesta sessão.', { status: 403 });
  }
  if (!storageConfigured()) {
    return new Response('Armazenamento não configurado.', { status: 503 });
  }

  const { id } = await context.params;
  const photo = await withTenant(access.tenant.id, (tx) =>
    tx.clinicalPhoto.findUnique({
      where: { id },
      select: { id: true, objectKey: true, status: true, patientId: true },
    }),
  );
  if (!photo || photo.status !== 'READY') {
    return new Response('Foto não encontrada.', { status: 404 });
  }

  // Belt and braces: RLS already scoped the lookup, but the key is what gets signed, and
  // signing a key outside this tenant's prefix would hand out another clinic's photo.
  if (!keyBelongsToTenant(photo.objectKey, access.tenant.id)) {
    console.error('[photos] key outside tenant prefix', { photoId: photo.id });
    return new Response('Foto não encontrada.', { status: 404 });
  }

  await auditPhoto('photo.view', {
    tenantId: access.tenant.id,
    userId: access.session.userId,
    photoId: photo.id,
    details: { patientId: photo.patientId },
  });

  const url = await signDownload(photo.objectKey);

  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      // Health data: never cached by a browser, a proxy or the tunnel.
      'cache-control': 'private, no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
