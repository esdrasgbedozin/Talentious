'use client';

/**
 * Login Page - Talentious
 * Allow users to sign in to their account
 */

import { useState, FormEvent, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordInput from '@/components/ui/PasswordInput';
import Navbar from '@/components/Navbar';
import { resendVerificationPublic } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading, isAuthenticated } = useAuth();

  // Check if user just registered (initialize state directly)
  const isJustRegistered = searchParams.get('registered') === 'true';

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState({
    email: '',
    password: '',
    general: '',
  });

  const [showRegisteredMessage, setShowRegisteredMessage] = useState(isJustRegistered);
  // Email non vérifié (403 au login) : proposer le renvoi du lien de confirmation.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  // Hide success message after 5 seconds
  useEffect(() => {
    if (isJustRegistered) {
      const timer = setTimeout(() => setShowRegisteredMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isJustRegistered]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/onboarding');
    }
  }, [isAuthenticated, router]);

  // Client-side validation
  const validateForm = (): boolean => {
    const newErrors = {
      email: '',
      password: '',
      general: '',
    };

    // Email validation
    if (!formData.email) {
      newErrors.email = 'L\'email est requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Format d\'email invalide';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Le mot de passe est requis';
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error !== '');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({ email: '', password: '', general: '' });

    // Client-side validation
    if (!validateForm()) {
      return;
    }

    setUnverifiedEmail(null);
    setResendState('idle');

    try {
      await login(formData.email, formData.password);

      // Login successful - redirect handled by useEffect above
      // The useAuth will set isAuthenticated to true
    } catch (error: unknown) {
      // Handle API errors
      const apiError = error as {
        response?: { status?: number; data?: { detail?: string } };
        message?: string;
      };

      // 403 = identifiants corrects mais adresse non vérifiée → proposer le renvoi.
      const msg = apiError.response?.data?.detail ?? apiError.message ?? '';
      if (apiError.response?.status === 403 || /non vérifiée/i.test(msg)) {
        setUnverifiedEmail(formData.email);
        return;
      }

      if (apiError.response?.data?.detail) {
        setErrors(prev => ({
          ...prev,
          general: apiError.response?.data?.detail || 'Erreur inconnue',
        }));
      } else if (apiError.message) {
        setErrors(prev => ({
          ...prev,
          general: apiError.message || 'Erreur inconnue',
        }));
      } else {
        setErrors(prev => ({
          ...prev,
          general: 'Email ou mot de passe incorrect',
        }));
      }
    }
  };

  return (
    <>
      <Navbar variant="app" />
      
      <div className="min-h-screen bg-background-light flex items-center justify-center px-4 py-24 relative overflow-hidden">
        <div className="w-full max-w-md relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-primary mb-3">
              Bon retour !
            </h1>
            <p className="text-text-secondary text-lg">Connectez-vous pour continuer</p>
          </div>

          {/* Success message if just registered */}
          {showRegisteredMessage && (
            <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-action/10 border border-action/20 rounded-xl animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-action rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-action font-medium">
                  Compte créé ! Un email de confirmation t'attend dans ta boîte — tu peux déjà te connecter.
                </p>
              </div>
            </div>
          )}

          {/* Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-border p-8 shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email non vérifié : identifiants OK mais adresse à confirmer */}
              {unverifiedEmail && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3">
                  <p className="text-sm text-amber-800">
                    Ton adresse <span className="font-semibold">{unverifiedEmail}</span> n&apos;est
                    pas encore vérifiée. Clique sur le lien reçu par email pour activer ton
                    compte (pense aux spams).
                  </p>
                  {resendState === 'sent' ? (
                    <p className="text-sm font-medium text-action">
                      ✓ Email renvoyé — vérifie ta boîte.
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={resendState === 'sending'}
                      onClick={async () => {
                        setResendState('sending');
                        try {
                          await resendVerificationPublic(unverifiedEmail);
                          setResendState('sent');
                        } catch {
                          setResendState('idle');
                        }
                      }}
                      className="text-sm font-semibold text-action hover:underline disabled:opacity-60"
                    >
                      {resendState === 'sending' ? 'Envoi…' : "Renvoyer l'email de vérification"}
                    </button>
                  )}
                </div>
              )}

              {/* General error */}
              {errors.general && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-600">{errors.general}</p>
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-primary mb-2">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="vous@exemple.com"
                  error={errors.email}
                  disabled={isLoading}
                  autoComplete="email"
                  className="transition-all"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-primary mb-2">
                  Mot de passe
                </label>
                <PasswordInput
                  id="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  error={errors.password}
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="transition-all"
                />
                <div className="mt-2 text-right">
                  <Link
                    href="/forgot-password"
                    className="text-sm text-text-secondary hover:text-action transition-colors"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                className="w-full shadow-lg shadow-action/20 hover:shadow-xl hover:shadow-action/30 transition-all"
                isLoading={isLoading}
                disabled={isLoading}
              >
                {isLoading ? 'Connexion en cours...' : 'Se connecter'}
              </Button>
            </form>
          </div>

          {/* Footer */}
          <div className="text-center mt-6 space-y-4">
            <p className="text-text-secondary">
              Pas encore de compte ?{' '}
              <Link href="/register" className="text-action font-semibold hover:underline transition-all">
                Créer un compte gratuitement
              </Link>
            </p>
            
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Retour à l&apos;accueil
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

// Wrap the form in Suspense for useSearchParams
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-background-light to-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-action"></div>
          <p className="mt-4 text-text-secondary">Chargement...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
