'use client';

/**
 * Confirmation du changement d'adresse email. Le lien reçu sur la NOUVELLE
 * boîte pointe ici avec ?token=... ; on applique via POST /auth/email/confirm.
 * Page publique.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { confirmEmailChange, getErrorMessage } from '@/lib/api';

type Status = 'loading' | 'success' | 'error';

function ConfirmEmailChangeInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) {
      setStatus('error');
      setMessage('Lien de confirmation invalide ou incomplet.');
      return;
    }
    confirmEmailChange(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(getErrorMessage(err));
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-light px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-action" />
            <h1 className="mt-6 text-xl font-semibold text-primary">Confirmation en cours…</h1>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-action" />
            <h1 className="mt-6 text-xl font-semibold text-primary">Adresse mise à jour !</h1>
            <p className="mt-2 text-text-secondary">
              Ton compte utilise désormais cette adresse. Connecte-toi avec elle.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-action px-6 py-3 font-medium text-white transition-colors hover:bg-action-hover"
            >
              Se connecter
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-error" />
            <h1 className="mt-6 text-xl font-semibold text-primary">Confirmation impossible</h1>
            <p className="mt-2 text-text-secondary">{message || 'Ce lien est invalide ou a expiré.'}</p>
            <Link
              href="/account"
              className="mt-6 inline-flex items-center justify-center rounded-lg border-2 border-primary px-6 py-3 font-medium text-primary transition-colors hover:bg-primary hover:text-white"
            >
              Retour à mon compte
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function ConfirmEmailChangePage() {
  return (
    <Suspense fallback={null}>
      <ConfirmEmailChangeInner />
    </Suspense>
  );
}
