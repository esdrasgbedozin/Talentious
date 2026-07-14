'use client';

/**
 * Reset-password page. Reached from the email link with ?token=...; the user sets
 * a new password, which consumes the (single-use) token and revokes old sessions.
 */
import { Suspense, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Button from '@/components/ui/Button';
import PasswordInput from '@/components/ui/PasswordInput';
import { resetPassword, getErrorMessage } from '@/lib/api';

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Lien de réinitialisation invalide ou incomplet.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setSaving(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-8 text-center shadow-xl">
        <CheckCircle2 className="mx-auto h-12 w-12 text-action" />
        <h1 className="mt-6 text-2xl font-bold text-primary">Mot de passe modifié</h1>
        <p className="mt-3 text-text-secondary">
          Ton mot de passe a été mis à jour. Tu peux te connecter avec ton nouveau
          mot de passe.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-action px-6 py-3 font-medium text-white transition-colors hover:bg-action-hover"
        >
          Se connecter
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="mb-3 text-3xl font-bold text-primary">Nouveau mot de passe</h1>
        <p className="text-text-secondary">Choisis un nouveau mot de passe pour ton compte.</p>
      </div>
      <div className="rounded-2xl border border-border bg-white p-8 shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-semibold text-primary">
              Nouveau mot de passe
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-2 block text-sm font-semibold text-primary">
              Confirme le mot de passe
            </label>
            <PasswordInput
              id="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={saving}
            disabled={saving}
          >
            {saving ? 'Enregistrement…' : 'Réinitialiser mon mot de passe'}
          </Button>
        </form>
      </div>
      <p className="mt-6 text-center text-text-secondary">
        <Link href="/login" className="font-semibold text-action hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <Navbar variant="app" />
      <div className="flex min-h-screen items-center justify-center bg-background-light px-4 py-24">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </>
  );
}
