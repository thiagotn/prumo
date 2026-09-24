// Object keys for clinical photos (ADR 0011, decision 6):
//
//   t/{tenant_id}/p/{patient_id}/e/{encounter_id}/{framing}-{ulid}.webp
//
// Two properties the shape is chosen for:
//
//  - **The tenant comes first.** The boundary between clinics is then legible in the
//    bucket as well as in the database. RLS cannot help inside the bucket — R2 has no
//    idea what a tenant is — so the prefix is the only thing that makes a stray listing
//    obviously wrong. A CHECK constraint on the table enforces it too.
//  - **No name, no document number.** A key turns up in logs, in error messages and in
//    support conversations. Identifiers do not identify a person on their own.
import type { PhotoFraming } from '@prisma/client';
import { isUlid, ulid } from './ulid';

/** The extension is fixed: the browser converts to WebP before uploading. */
export const PHOTO_EXTENSION = 'webp';
export const PHOTO_CONTENT_TYPE = 'image/webp';

/** 12 MB. A phone photo converted to WebP lands far below this; anything above is a mistake. */
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

const FRAMING_SEGMENT: Record<PhotoFraming, string> = {
  FRONT: 'front',
  LEFT_PROFILE: 'left',
  RIGHT_PROFILE: 'right',
  UPPER_THIRD: 'upper',
};

/** Product copy, pt-BR. */
export const FRAMING_LABELS: Record<PhotoFraming, string> = {
  FRONT: 'Frontal',
  LEFT_PROFILE: 'Perfil esquerdo',
  RIGHT_PROFILE: 'Perfil direito',
  UPPER_THIRD: 'Terço superior',
};

/** The four framings, in the order the screen offers them. */
export const FRAMINGS: PhotoFraming[] = ['FRONT', 'LEFT_PROFILE', 'RIGHT_PROFILE', 'UPPER_THIRD'];

export type PhotoKeyParts = {
  tenantId: string;
  patientId: string;
  encounterId: string;
  framing: PhotoFraming;
};

export function buildPhotoKey(parts: PhotoKeyParts, id: string = ulid()): string {
  for (const [name, value] of Object.entries({
    tenantId: parts.tenantId,
    patientId: parts.patientId,
    encounterId: parts.encounterId,
  })) {
    // Anything that is not a UUID here would let a caller shape the key, and a key that
    // escapes its prefix escapes the isolation the prefix exists to express.
    if (!/^[0-9a-f-]{36}$/i.test(value)) {
      throw new Error(`Invalid ${name} for a photo key: ${value}`);
    }
  }
  if (!isUlid(id)) throw new Error(`Invalid ULID for a photo key: ${id}`);

  const segment = FRAMING_SEGMENT[parts.framing];
  if (!segment) throw new Error(`Unknown framing: ${parts.framing}`);

  return `t/${parts.tenantId}/p/${parts.patientId}/e/${parts.encounterId}/${segment}-${id}.${PHOTO_EXTENSION}`;
}

/** The prefix holding every photo of one tenant — what a deletion sweep would target. */
export function tenantPrefix(tenantId: string): string {
  return `t/${tenantId}/`;
}

/** The prefix holding every photo of one patient, for an erasure request. */
export function patientPrefix(tenantId: string, patientId: string): string {
  return `t/${tenantId}/p/${patientId}/`;
}

/** True when the key belongs to this tenant. Checked before signing anything. */
export function keyBelongsToTenant(key: string, tenantId: string): boolean {
  return key.startsWith(tenantPrefix(tenantId));
}
