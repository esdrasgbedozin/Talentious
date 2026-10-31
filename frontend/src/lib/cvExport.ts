/**
 * Flux d'export PDF asynchrone (M2-T26) — logique pure, sans DOM, donc testable
 * hors navigateur. Le déclenchement du téléchargement (object URL + ancre) est
 * à la charge de l'appelant côté client (hook `useCvExport`).
 *
 * Enchaînement : POST /cv/{id}/export (202) -> polling GET /jobs/{id} (route
 * générique, 3 s, aligné sur l'import PDF) jusqu'à `succeeded` | `failed` ->
 * récupération du binaire via le `download_url` RELATIF renvoyé par le job
 * (chemin proxifié : auth + ownership revérifiés côté serveur, bucket privé —
 * ADR-EXPORT-DELIVERY).
 *
 * Les erreurs axios sont relayées TELLES QUELLES (le `status` reste visible pour
 * la gestion du 402 par l'intercepteur, et `getExportErrorMessage` en dérive le
 * message FR) ; les conditions terminales propres au flux (job `failed`, délai
 * dépassé, fichier indisponible) lèvent une `Error` déjà au tutoiement. Le flux
 * est annulable via un `AbortSignal` (démontage du composant).
 */
import axios from 'axios';
import type { components } from '@/generated/api';
import { apiClient } from './api';

type ExportFormat = components['schemas']['ExportFormat'];
type ExportJobAccepted = components['schemas']['ExportJobAccepted'];
type JobStatus = components['schemas']['JobStatus'];

export interface ExportedFile {
  blob: Blob;
  filename: string;
}

export interface ExportOptions {
  /** Annule le flux (polling + requêtes en vol) — typiquement au démontage. */
  signal?: AbortSignal;
}

// Conventions partagées avec l'import PDF (lib/api.ts) : cadence de polling 3 s.
const POLL_INTERVAL_MS = 3_000;
// Borne GLOBALE : le rendu Chromium est rapide, mais au-delà le job a de toute
// façon viré `failed` côté serveur. Évite un polling infini si l'état se fige.
const POLL_TIMEOUT_MS = 120_000;
// Borne PAR REQUÊTE : coupe une requête suspendue avant la borne globale.
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_PDF_FILENAME = 'cv.pdf';

// `download_url` vient de la réponse serveur. On n'accepte QUE le chemin relatif
// attendu `/jobs/{id}/download` : une URL absolue (`https://…`) ou
// protocole-relative (`//hôte`), réinjectée dans apiClient, emporterait le
// Bearer + les cookies vers une origine tierce (défense en profondeur — revue
// sécurité A1). `[^/]+` borne l'id à un seul segment sans sur-contraindre son
// format (il bloque aussi tout segment supplémentaire).
const DOWNLOAD_PATH_RE = /^\/jobs\/[^/]+\/download$/;

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

/**
 * Nom de fichier suggéré, lu dans l'en-tête `Content-Disposition`. `filename*`
 * (RFC 5987, encodage UTF-8) est prioritaire sur `filename`. On réduit au
 * basename et on retire les caractères de contrôle (durcissement : la valeur
 * alimente l'attribut `download` d'une ancre — revue sécurité S1). Repli sur un
 * nom par défaut si l'en-tête est absent (ex. non exposé par CORS) ou illisible.
 */
export const parseContentDispositionFilename = (
  contentDisposition: unknown,
): string => {
  if (typeof contentDisposition !== 'string') return DEFAULT_PDF_FILENAME;

  let raw: string | undefined;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (encoded?.[1]) {
    try {
      raw = decodeURIComponent(encoded[1]);
    } catch {
      // En-tête malformé : on ignore et on tente `filename` nu.
    }
  }
  if (raw === undefined) {
    raw = /filename="?([^";]+)"?/i.exec(contentDisposition)?.[1];
  }
  if (!raw) return DEFAULT_PDF_FILENAME;

  const sanitized = raw
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f]/g, '')
    .trim();
  return sanitized || DEFAULT_PDF_FILENAME;
};

/**
 * Normalise une erreur du GET binaire : avec `responseType: 'blob'`, axios livre
 * aussi le CORPS d'erreur (problem+json) sous forme de Blob. On le reparse en
 * JSON et on le réaffecte à `error.response.data` pour que
 * `getExportErrorMessage` retrouve le `type` RFC 7807 (sinon l'utilisateur
 * recevait le message axios anglais — revue qualité).
 */
const normalizeBlobError = async (error: unknown): Promise<unknown> => {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const text = await error.response.data.text();
      error.response.data = text ? JSON.parse(text) : {};
    } catch {
      // Corps non-JSON : on laisse l'erreur en l'état (repli par statut HTTP).
    }
  }
  return error;
};

/**
 * Exporte un CV en PDF de bout en bout et renvoie le fichier prêt à être
 * téléchargé. Lève en cas d'échec (voir en-tête de module) ou si le flux est
 * annulé (`AbortError`, à ignorer par l'appelant).
 */
export const exportCvPdf = async (
  cvId: string,
  { signal }: ExportOptions = {},
): Promise<ExportedFile> => {
  const format: ExportFormat = 'pdf';

  const { data: job } = await apiClient.post<ExportJobAccepted>(
    `/cv/${cvId}/export`,
    { format },
    { signal, timeout: REQUEST_TIMEOUT_MS },
  );

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    await sleep(POLL_INTERVAL_MS, signal);
    const { data: state } = await apiClient.get<JobStatus>(
      `/jobs/${job.job_id}`,
      { signal, timeout: REQUEST_TIMEOUT_MS },
    );

    if (state.status === 'succeeded') {
      const downloadUrl = state.result?.download_url;
      if (!downloadUrl || !DOWNLOAD_PATH_RE.test(downloadUrl)) {
        throw new Error(
          "L'export est terminé mais le fichier est indisponible. Relance l'export.",
        );
      }
      let response;
      try {
        response = await apiClient.get(downloadUrl, {
          responseType: 'blob',
          signal,
          timeout: REQUEST_TIMEOUT_MS,
        });
      } catch (error) {
        throw await normalizeBlobError(error);
      }
      return {
        blob: response.data as Blob,
        filename: parseContentDispositionFilename(
          response.headers?.['content-disposition'],
        ),
      };
    }

    if (state.status === 'failed') {
      throw new Error("L'export a échoué. Relance-le dans un instant.");
    }

    if (Date.now() > deadline) {
      throw new Error(
        "L'export prend trop de temps. Réessaie dans un instant.",
      );
    }
  }
};
