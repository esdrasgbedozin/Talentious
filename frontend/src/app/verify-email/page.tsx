'use client';

/**
 * Email verification landing page. The link in the verification email points here
 * with a ?token=... query; we exchange it via POST /auth/verify-email and show the
 * outcome. Public page (no auth required).
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { verifyEmail, getErrorMessage } from '@/lib/api';

type Status = 'loading' | 'success' | 'error';

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard against React 18 double-invoke in dev
    ran.current = true;

    if (!token) {
      setStatus('error');
      setMessage('Lien de vérification invalide ou incomplet.');
      return;
    }
    verifyEmail(token)
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
            <h1 className="mt-6 text-xl font-semibold text-primary">
              Vérification en cours…
            </h1>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-action" />
            <h1 className="mt-6 text-xl font-semibold text-primary">
              Adresse confirmée !
            </h1>
            <p className="mt-2 text-text-secondary">
              Ton adresse email est vérifiée. Tu peux profiter pleinement de Talentious.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-action px-6 py-3 font-medium text-white transition-colors hover:bg-action-hover"
            >
              Accéder à mon espace
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-error" />
            <h1 className="mt-6 text-xl font-semibold text-primary">
              Vérification impossible
            </h1>
            <p className="mt-2 text-text-secondary">
              {message || 'Ce lien est invalide ou a expiré.'}
            </p>
            <p className="mt-4 text-sm text-text-secondary">
              Connecte-toi et demande un nouveau lien depuis ton espace.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center justify-center rounded-lg border-2 border-primary px-6 py-3 font-medium text-primary transition-colors hover:bg-primary hover:text-white"
            >
              Se connecter
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
