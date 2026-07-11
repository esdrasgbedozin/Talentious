'use client';

/**
 * CV print / PDF export route. Renders only the CV sheet (no app chrome) and
 * auto-opens the browser's print dialog — the user picks "Save as PDF". A small
 * toolbar (hidden when printing) offers a manual trigger and a way back.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Printer, ArrowLeft } from 'lucide-react';
import CVRenderer from '@/components/cv/CVRenderer';
import Button from '@/components/ui/Button';
import { getCV, getErrorMessage, type CVDetail } from '@/lib/api';

export default function CVPrintPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cvId = params?.id;

  const [cv, setCv] = useState<CVDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cvId) return;
    let cancelled = false;
    // `?preview=1` shows the sheet without auto-opening the print dialog
    // (used by the editor's "Aperçu"); the bare route auto-prints (used by the
    // dashboard's "Télécharger PDF").
    const previewOnly = new URLSearchParams(window.location.search).has('preview');
    getCV(cvId)
      .then((data) => {
        if (cancelled) return;
        setCv(data);
        // The browser uses document.title as the default "Save as PDF" filename.
        document.title = data.cv_name || 'CV';
        if (!previewOnly) {
          // Let the layout settle, then open the print dialog.
          setTimeout(() => window.print(), 400);
        }
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err)));
    const originalTitle = document.title;
    return () => {
      cancelled = true;
      document.title = originalTitle;
    };
  }, [cvId]);

  if (error) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="mb-6 text-text-secondary">{error}</p>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          Retour au tableau de bord
        </Button>
      </main>
    );
  }

  if (!cv) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-action border-t-transparent" />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background-light py-8 print:min-h-0 print:bg-white print:py-0">
      {/* Toolbar — hidden in the printed output */}
      <div className="print-hide mx-auto mb-6 flex max-w-[210mm] items-center justify-between px-4">
        <button
          onClick={() => router.push(`/cv/${cvId}/edit`)}
          className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l&apos;édition
        </button>
        <Button variant="primary" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimer / Enregistrer en PDF
        </Button>
      </div>

      <div className="mx-auto w-[210mm] max-w-full bg-white shadow-lg print:w-auto print:shadow-none">
        <CVRenderer profile={cv.cv_data_json} />
      </div>
    </div>
  );
}
