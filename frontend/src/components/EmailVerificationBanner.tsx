'use client';

/**
 * Soft nudge shown to signed-in users who haven't confirmed their email yet.
 * Non-blocking (the app stays usable in beta); offers a one-click resend.
 */
import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { resendVerification, getErrorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

export default function EmailVerificationBanner() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);

  // Only nudge once we know the account exists and is explicitly unverified.
  if (!user || user.email_verified !== false) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await resendVerification();
      showToast('Email de vérification renvoyé. Pense à vérifier tes spams.', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-b border-warning/30 bg-warning/10">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-2 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-text-primary">
          <MailWarning className="h-4 w-4 flex-shrink-0 text-warning" />
          Confirme ton adresse email pour sécuriser ton compte.
        </p>
        <button
          onClick={handleResend}
          disabled={sending}
          className="font-medium text-action underline-offset-2 hover:underline disabled:opacity-60"
        >
          {sending ? 'Envoi…' : "Renvoyer l'email"}
        </button>
      </div>
    </div>
  );
}
