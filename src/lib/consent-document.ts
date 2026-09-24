// Turns a signed consent row into the PDF bytes and the headers that carry it.
//
// Shared by the two ways a signed term is downloaded: the clinic's screen, and the
// patient's own link. Neither should be able to produce a document the other could not.
import 'server-only';
import { consentPdfFilename, renderConsentPdf } from './consent-pdf';

export type SignedConsentRow = {
  id: string;
  titleSnapshot: string;
  bodySnapshot: string;
  templateVersion: number;
  signerName: string | null;
  signerNote: string | null;
  signedAt: Date | null;
  signedIp: string | null;
  signatureImage: Uint8Array | null;
  signatureHash: string | null;
  collectedByUserId: string | null;
  patient: { name: string };
  appointment: { procedure: { name: string } | null } | null;
};

export type ConsentPdfContext = {
  clinicName: string;
  clinicUnit: string | null;
};

/** True when the row holds everything a document needs. The CHECK constraint says the
 *  same thing in the database; this is what makes it a 404 rather than a crash. */
export function isSigned(consent: SignedConsentRow): boolean {
  return Boolean(
    consent.signedAt && consent.signerName && consent.signatureImage && consent.signatureHash,
  );
}

export async function consentPdfResponse(
  consent: SignedConsentRow,
  context: ConsentPdfContext,
): Promise<Response> {
  if (!isSigned(consent)) return new Response('Termo ainda não assinado.', { status: 404 });

  const pdf = await renderConsentPdf({
    clinicName: context.clinicName,
    clinicUnit: context.clinicUnit,
    title: consent.titleSnapshot,
    body: consent.bodySnapshot,
    templateVersion: consent.templateVersion,
    patientName: consent.patient.name,
    procedureName: consent.appointment?.procedure?.name ?? null,
    signerName: consent.signerName!,
    signerNote: consent.signerNote,
    signedAt: consent.signedAt!,
    signedIp: consent.signedIp,
    signature: consent.signatureImage!,
    hash: consent.signatureHash!,
    // Collected at the counter by a member of staff, or by the patient from her link.
    channel: consent.collectedByUserId ? 'tela' : 'link',
  });

  return new Response(pdf as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${consentPdfFilename(consent.id, consent.signedAt!)}"`,
      // Health data: never cached by a browser, a proxy or the tunnel.
      'cache-control': 'private, no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
