'use client';

/**
 * DeleteAccountSection — RGPD Art. 17 "danger zone".
 *
 * Renders a clearly-separated destructive card plus a strong confirmation modal:
 * the delete button stays disabled until the user re-types their exact email.
 * This is a client-side safeguard against accidental erasure — the API itself is
 * authorized by the bearer token (see backend app/routes/account.py). On success
 * it tears down the local session (token, user, session cookie) and sends the
 * user home; the now-orphaned token is de-facto rejected on any further request.
 */
import { useEffect, useState } from 'react';
import Modal, { ModalFooter } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { deleteAccount, getErrorMessage } from '@/lib/api';
import { getMe } from '@/lib/auth';

function clearSessionAndGoHome() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  if (typeof document !== 'undefined') {
    document.cookie =
      'talentious_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }
  window.location.href = '/';
}

export default function DeleteAccountSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The authoritative account email (from /auth/me) is what the user must
  // re-type — a fresh account's *profile* email can still be empty.
  const [email, setEmail] = useState('');

  useEffect(() => {
    getMe()
      .then((user) => setEmail(user.email))
      .catch(() => {
        /* email stays empty → confirmation input is disabled, fail-safe */
      });
  }, []);

  const expected = email.trim().toLowerCase();
  const matches =
    expected.length > 0 && confirmValue.trim().toLowerCase() === expected;

  const close = () => {
    if (isDeleting) return;
    setIsOpen(false);
    setConfirmValue('');
    setError(null);
  };

  const handleDelete = async () => {
    if (!matches || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      clearSessionAndGoHome();
    } catch (err) {
      setError(getErrorMessage(err));
      setIsDeleting(false);
    }
  };

  return (
    <section className="mt-10 rounded-2xl border border-error/30 bg-error/5 p-6">
      <h2 className="text-lg font-semibold text-error">Zone de danger</h2>
      <p className="mt-2 max-w-2xl text-sm text-text-secondary">
        La suppression de votre compte est <strong>définitive et immédiate</strong>.
        Toutes vos données — profil, CVs générés et pass actifs — seront effacées et
        ne pourront pas être récupérées.
      </p>
      <div className="mt-4">
        <Button
          variant="danger"
          onClick={() => setIsOpen(true)}
          className="w-full sm:w-auto"
        >
          Supprimer mon compte
        </Button>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={close}
        title="Supprimer définitivement votre compte ?"
        description="Cette action est irréversible."
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-text-secondary">
            Pour confirmer, saisissez votre adresse email&nbsp;:{' '}
            <span className="font-medium text-text-primary">{email || '…'}</span>
          </p>
          <Input
            type="email"
            autoComplete="off"
            placeholder="votre@email.com"
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            disabled={!expected || isDeleting}
            aria-label="Confirmez votre email"
          />
          {error && (
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={close} disabled={isDeleting}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={!matches}
            isLoading={isDeleting}
          >
            {isDeleting ? 'Suppression…' : 'Supprimer définitivement'}
          </Button>
        </ModalFooter>
      </Modal>
    </section>
  );
}
