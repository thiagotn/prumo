'use client';

import { useRef, useState } from 'react';
import type { PhotoFraming } from '@prisma/client';
import { FRAMING_LABELS, FRAMINGS, MAX_PHOTO_BYTES } from '@/lib/photo-key';
import styles from './encounter.module.css';

export type ExistingPhoto = { id: string; framing: PhotoFraming };

type Props = {
  encounterId: string;
  photos: ExistingPhoto[];
  /** The same framings from the patient's previous encounter, for the ghost guide. */
  previousPhotos: ExistingPhoto[];
  storageReady: boolean;
  canUpload: boolean;
};

/**
 * Converts to WebP in the browser before uploading.
 *
 * Two reasons it happens here rather than on the server: the bytes go straight to R2 and
 * never reach the pod, so the pod could not convert them anyway; and a phone photo is
 * several megabytes of JPEG that becomes a few hundred kilobytes of WebP, which is the
 * difference between an upload that works on clinic wifi and one that does not.
 */
async function toWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  // Long edge capped at 2000px: enough to compare a before and after, far less to send.
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a imagem neste navegador.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.86),
  );
  if (!blob) throw new Error('Não foi possível converter a imagem.');
  return blob;
}

export function Photos({ encounterId, photos, previousPhotos, storageReady, canUpload }: Props) {
  const [items, setItems] = useState(photos);
  const [busy, setBusy] = useState<PhotoFraming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Partial<Record<PhotoFraming, HTMLInputElement | null>>>({});

  async function upload(framing: PhotoFraming, file: File) {
    setError(null);
    setBusy(framing);
    try {
      const webp = await toWebp(file);
      if (webp.size > MAX_PHOTO_BYTES) {
        throw new Error('A imagem ficou grande demais mesmo depois de convertida.');
      }

      const signResponse = await fetch('/api/photos/sign-upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ encounterId, framing }),
      });
      const signed = await signResponse.json();
      if (!signResponse.ok) throw new Error(signed.error ?? 'Não foi possível preparar o envio.');

      // Straight to R2: the bytes never touch the server.
      const put = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': signed.contentType },
        body: webp,
      });
      if (!put.ok) throw new Error('O envio para o armazenamento falhou.');

      const confirm = await fetch(`/api/photos/${signed.photoId}/confirm`, { method: 'POST' });
      const confirmed = await confirm.json();
      if (!confirm.ok) throw new Error(confirmed.error ?? 'Não foi possível confirmar o envio.');

      setItems((current) => [
        ...current.filter((p) => p.framing !== framing),
        { id: signed.photoId, framing },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha inesperada no envio.');
    } finally {
      setBusy(null);
      const input = inputs.current[framing];
      if (input) input.value = '';
    }
  }

  if (!storageReady) {
    return (
      <p className={styles.hint}>
        O armazenamento de fotos não está configurado nesta instalação. As fotos clínicas exigem
        bucket privado com URL assinada — ver ADR 0011.
      </p>
    );
  }

  return (
    <div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.photoGrid}>
        {FRAMINGS.map((framing) => {
          const current = items.find((p) => p.framing === framing);
          const previous = previousPhotos.find((p) => p.framing === framing);
          return (
            <div className={styles.photoSlot} key={framing}>
              <div className={styles.photoLabel}>{FRAMING_LABELS[framing]}</div>

              <div className={styles.photoFrame}>
                {current ? (
                  // The route authorises, records the read and redirects to a signed URL;
                  // the signed URL itself is never in the HTML.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={styles.photoImage}
                    src={`/api/photos/${current.id}/raw`}
                    alt={`${FRAMING_LABELS[framing]} desta sessão`}
                  />
                ) : previous ? (
                  <>
                    {/* Ghost of the previous session, to line the new shot up with it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={`${styles.photoImage} ${styles.photoGhost}`}
                      src={`/api/photos/${previous.id}/raw`}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className={styles.photoHintOverlay}>Guia da sessão anterior</span>
                  </>
                ) : (
                  <span className={styles.photoEmpty}>Sem foto</span>
                )}
              </div>

              {canUpload ? (
                <>
                  <input
                    ref={(el) => {
                      inputs.current[framing] = el;
                    }}
                    id={`photo-${framing}`}
                    className={styles.photoInput}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(framing, file);
                    }}
                    disabled={busy !== null}
                  />
                  <label className="btn btn-secondary touch" htmlFor={`photo-${framing}`}>
                    {busy === framing ? 'Enviando…' : current ? 'Substituir' : 'Adicionar'}
                  </label>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className={styles.hint}>
        As fotos vão direto para um bucket privado — não passam por este servidor. Cada
        visualização emite um link que vale poucos segundos e fica registrada no log de auditoria.
      </p>
    </div>
  );
}
