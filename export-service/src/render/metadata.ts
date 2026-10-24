/**
 * M2-T07 — normalisation des métadonnées PDF (déterminisme D6).
 *
 * Chromium (Skia) écrit dans chaque PDF : Producer « Skia/PDF m### »,
 * CreationDate/ModDate à l'heure COURANTE et un /ID de trailer variable —
 * trois sources de non-déterminisme et une fuite d'outillage. Réécriture via
 * pdf-lib (pur JS, épinglé exact) : les offsets xref sont régénérés proprement
 * (jamais de patch d'octets à longueur fixe).
 *
 * - Title « CV » (neutre — jamais une donnée du payload, ADR décision 4),
 *   Creator/Producer « Talentious » seuls, dates FIXES (époque ci-dessous),
 *   /ID de trailer CONSTANT.
 * - L'octet identique entre deux rendus n'est pas contractuel (R4) mais il
 *   est testé : s'il casse (montée Chromium), on dégradera sciemment.
 */
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";

/** Date fixe de tous les documents : l'époque choisie est arbitraire et
 * ASSUMÉE (déterminisme > horodatage ; la date réelle vit en base, pas dans
 * le fichier). */
export const PDF_FIXED_DATE = new Date("2000-01-01T00:00:00Z");

/** /ID de trailer constant (32 hex) : identifiant de FORME, pas de contenu. */
const PDF_FIXED_ID = "54414C454E54494F55532D43562D3030";

export async function normalizePdfMetadata(pdf: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  doc.setTitle("CV");
  doc.setCreator("Talentious");
  doc.setProducer("Talentious");
  doc.setCreationDate(PDF_FIXED_DATE);
  doc.setModificationDate(PDF_FIXED_DATE);
  const id = PDFHexString.of(PDF_FIXED_ID);
  // trailerInfo est une API INTERNE de pdf-lib (pas de setter public pour
  // /ID) — comportement couvert par determinism.test.ts.
  doc.context.trailerInfo.ID = doc.context.obj([id, id]);
  // Garde-fou (revue T07) : Chromium n'émet ni XMP ni pièces jointes
  // aujourd'hui (vérifié), mais un flux /Metadata XMP porterait DocumentID/
  // InstanceID variables + outillage — retiré s'il apparaît un jour.
  for (const key of ["Metadata", "Names", "Outlines"]) {
    doc.catalog.delete(PDFName.of(key));
  }
  // useObjectStreams:false (revue T07) : Info et catalogue restent EN CLAIR
  // dans le fichier — auditables par les tests anti-trace (un object stream
  // compressé rendrait le grep aveugle), pour quelques Ko.
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/** Rendu + normalisation en UN point d'entrée (revue T07) : un futur appelant
 * (aperçu PDF, export docx M8) ne peut pas « oublier » la normalisation. */
export async function renderNormalizedPdf(
  renderer: { render(html: string): Promise<Buffer> },
  html: string,
): Promise<Buffer> {
  return normalizePdfMetadata(await renderer.render(html));
}
