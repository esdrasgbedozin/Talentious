'use client';

/**
 * Forgot-password page. Sends a reset link. The success message is intentionally
 * generic (never reveals whether the email exists) to match the enumeration-safe
 * backend.
 */
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { forgotPassword, getErrorMessage } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Navbar variant="app" />
      <div className="flex min-h-screen items-center justify-center bg-background-light px-4 py-24">
        <div className="w-full max-w-md">
          {sent ? (
            <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-xl">
              <MailCheck className="mx-auto h-12 w-12 text-action" />
              <h1 className="mt-6 text-2xl font-bold text-primary">Vérifie ta boîte mail</h1>
              <p className="mt-3 text-text-secondary">
                Si un compte est associé à cette adresse, un lien de réinitialisation
                vient d&apos;être envoyé. Pense à regarder tes spams.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex items-center justify-center rounded-lg border-2 border-primary px-6 py-3 font-medium text-primary transition-colors hover:bg-primary hover:text-white"
              >
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="mb-3 text-3xl font-bold text-primary">
                  Mot de passe oublié ?
                </h1>
                <p className="text-text-secondary">
                  Saisis ton email, on t&apos;envoie un lien pour en choisir un nouveau.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-white p-8 shadow-xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                      {error}
                    </div>
                  )}
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-sm font-semibold text-primary"
                    >
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@exemple.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    isLoading={sending}
                    disabled={sending}
                  >
                    {sending ? 'Envoi…' : 'Envoyer le lien'}
                  </Button>
                </form>
              </div>
              <p className="mt-6 text-center text-text-secondary">
                <Link href="/login" className="font-semibold text-action hover:underline">
                  Retour à la connexion
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
