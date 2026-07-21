'use client';

/**
 * Mon compte — gestion des identifiants (retour testeurs, chantier 2).
 *
 * - Changer le mot de passe (ré-authentification par le mot de passe actuel ;
 *   toutes les sessions sont révoquées côté serveur).
 * - Changer d'adresse email : le lien de confirmation part vers la NOUVELLE
 *   adresse ; le compte ne change qu'après confirmation.
 * - Zone de danger (suppression RGPD) — déplacée ici depuis le profil : le
 *   profil reste dédié aux données professionnelles.
 */
import { useState, FormEvent } from 'react';
import { ShieldCheck, MailWarning } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordInput from '@/components/ui/PasswordInput';
import DeleteAccountSection from '@/components/profile/DeleteAccountSection';
import { useAuth } from '@/context/AuthContext';
import { changePassword, requestEmailChange, getErrorMessage } from '@/lib/api';

export default function AccountPage() {
  const { user } = useAuth();

  // --- Changement de mot de passe ---
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwState, setPwState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [pwError, setPwError] = useState('');

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwNew.length < 8) {
      setPwError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setPwState('saving');
    try {
      await changePassword(pwCurrent, pwNew);
      setPwState('done');
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    } catch (err) {
      setPwError(getErrorMessage(err));
      setPwState('idle');
    }
  };

  // --- Changement d'email ---
  const [emailNew, setEmailNew] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailState, setEmailState] = useState<'idle' | 'saving' | 'sent'>('idle');
  const [emailError, setEmailError] = useState('');

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailState('saving');
    try {
      await requestEmailChange(emailNew, emailPw);
      setEmailState('sent');
      setEmailPw('');
    } catch (err) {
      setEmailError(getErrorMessage(err));
      setEmailState('idle');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Navbar variant="authenticated" />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold text-text-primary">Mon compte</h1>
        <p className="mt-2 text-text-secondary">
          Identifiants de connexion et sécurité. Tes informations professionnelles
          vivent dans <a href="/profile" className="font-medium text-action hover:underline">Mon Profil</a>.
        </p>

        {/* Identifiants */}
        <section className="mt-8 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-text-primary">Adresse email</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-text-primary">{user?.email}</span>
            {user?.email_verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-action/10 px-3 py-1 text-xs font-medium text-action">
                <ShieldCheck className="h-3.5 w-3.5" /> Vérifiée
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                <MailWarning className="h-3.5 w-3.5" /> Non vérifiée
              </span>
            )}
          </div>

          <form onSubmit={submitEmail} className="mt-6 space-y-4 border-t border-border pt-6">
            <h3 className="font-medium text-text-primary">Changer d&apos;adresse</h3>
            {emailState === 'sent' ? (
              <p className="rounded-xl border border-action/30 bg-action/5 p-4 text-sm text-text-primary">
                ✓ Un lien de confirmation a été envoyé à{' '}
                <span className="font-semibold">{emailNew}</span>. Ton adresse actuelle
                reste active tant que tu n&apos;as pas cliqué ce lien.
              </p>
            ) : (
              <>
                {emailError && (
                  <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600" role="alert">
                    {emailError}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="new-email" className="mb-1.5 block text-sm font-medium text-text-primary">
                      Nouvelle adresse
                    </label>
                    <Input
                      id="new-email"
                      type="email"
                      value={emailNew}
                      onChange={(e) => setEmailNew(e.target.value)}
                      placeholder="nouvelle@adresse.com"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="email-pw" className="mb-1.5 block text-sm font-medium text-text-primary">
                      Mot de passe actuel
                    </label>
                    <PasswordInput
                      id="email-pw"
                      value={emailPw}
                      onChange={(e) => setEmailPw(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                </div>
                <Button type="submit" variant="outline" disabled={emailState === 'saving'} isLoading={emailState === 'saving'}>
                  Envoyer le lien de confirmation
                </Button>
              </>
            )}
          </form>
        </section>

        {/* Mot de passe */}
        <section className="mt-6 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-text-primary">Mot de passe</h2>
          {pwState === 'done' ? (
            <p className="mt-4 rounded-xl border border-action/30 bg-action/5 p-4 text-sm text-text-primary">
              ✓ Mot de passe modifié. Par sécurité, tes autres sessions ont été
              déconnectées et un email de confirmation t&apos;a été envoyé.
            </p>
          ) : (
            <form onSubmit={submitPassword} className="mt-4 space-y-4">
              {pwError && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600" role="alert">
                  {pwError}
                </p>
              )}
              <div>
                <label htmlFor="pw-current" className="mb-1.5 block text-sm font-medium text-text-primary">
                  Mot de passe actuel
                </label>
                <PasswordInput
                  id="pw-current"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="pw-new" className="mb-1.5 block text-sm font-medium text-text-primary">
                    Nouveau mot de passe
                  </label>
                  <PasswordInput
                    id="pw-new"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    placeholder="8 caractères minimum"
                    required
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label htmlFor="pw-confirm" className="mb-1.5 block text-sm font-medium text-text-primary">
                    Confirmer
                  </label>
                  <PasswordInput
                    id="pw-confirm"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <Button type="submit" variant="primary" disabled={pwState === 'saving'} isLoading={pwState === 'saving'}>
                Changer mon mot de passe
              </Button>
            </form>
          )}
        </section>

        {/* Zone de danger (déplacée depuis /profile) */}
        <DeleteAccountSection />
      </main>
    </div>
  );
}
