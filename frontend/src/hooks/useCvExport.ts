'use client';

/**
 * useCvExport (M2-T26) — colle UI du flux d'export PDF asynchrone.
 *
 * Expose un déclencheur par CV et l'état « export en cours » (pour le spinner du
 * bouton). Au succès, déclenche le téléchargement navigateur du fichier reçu et
 * notifie ; à l'échec, affiche un message RFC 7807 traduit au tutoiement. Le 402
 * (capacité premium) est déjà géré globalement par l'intercepteur axios
 * (redirection /billing) : on ne double pas d'un toast. Le flux est annulé au
 * démontage et aucun état n'est posé après coup.
 */
import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import {
  exportCvPdf,
  toSafePdfFilename,
  type ExportedFile,
} from '@/lib/cvExport';
import { getExportErrorMessage } from '@/lib/exportErrors';

// Délai avant révocation de l'object URL : laisse le navigateur capter le
// téléchargement (certains annulent si l'URL est révoquée dans le tick du clic).
const REVOKE_DELAY_MS = 1_000;

/** Déclenche le téléchargement navigateur d'un blob via un object URL éphémère. */
export const triggerBrowserDownload = ({
  blob,
  filename,
}: ExportedFile): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
};

export interface UseCvExportResult {
  /**
   * Lance l'export PDF d'un CV (no-op si un export est déjà en cours).
   * `cvName` nomme le fichier téléchargé (sinon repli sur le nom serveur).
   */
  exportPdf: (cvId: string, cvName?: string) => Promise<void>;
  /** Id du CV en cours d'export, ou null. */
  exportingId: string | null;
  /** Vrai tant qu'un export est en cours (pour l'état de chargement du bouton). */
  isExporting: boolean;
}

export function useCvExport(): UseCvExportResult {
  const toast = useToast();
  const [exportingId, setExportingId] = useState<string | null>(null);
  // Verrou SYNCHRONE : empêche deux clics dans le même tick de lancer deux
  // exports (l'état React n'est pas encore à jour à ce moment-là).
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const exportPdf = useCallback(
    async (cvId: string, cvName?: string) => {
      if (runningRef.current) return;
      runningRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      setExportingId(cvId);
      try {
        const file = await exportCvPdf(cvId, { signal: controller.signal });
        // Le front nomme le fichier d'après le CV (le Content-Disposition serveur
        // est générique et non lisible en cross-origin) ; repli sur le nom serveur.
        const filename = cvName ? toSafePdfFilename(cvName) : file.filename;
        triggerBrowserDownload({ blob: file.blob, filename });
        if (mountedRef.current) {
          toast.success('Ton CV en PDF est prêt, le téléchargement démarre.');
        }
      } catch (error) {
        // Annulation (démontage) : silencieux.
        if (controller.signal.aborted || axios.isCancel(error)) return;
        // 402 : l'intercepteur axios redirige déjà vers /billing — pas de toast.
        if (axios.isAxiosError(error) && error.response?.status === 402) return;
        if (mountedRef.current) toast.error(getExportErrorMessage(error));
      } finally {
        runningRef.current = false;
        if (mountedRef.current) setExportingId(null);
      }
    },
    [toast],
  );

  return { exportPdf, exportingId, isExporting: exportingId !== null };
}
