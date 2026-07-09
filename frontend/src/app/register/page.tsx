'use client';

/**
 * Registration Page - Talentious
 * Allow users to create a new account
 */

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Navbar from '@/components/Navbar';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
  });

  const [errors, setErrors] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    general: '',
  });

  const [success, setSuccess] = useState(false);

  // Client-side validation
  const validateForm = (): boolean => {
    const newErrors = {
      email: '',
      password: '',
      passwordConfirm: '',
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
    } else if (formData.password.length < 8) {
      newErrors.password = 'Le mot de passe doit contenir au moins 8 caractères';
    }

    // Password confirmation
    if (!formData.passwordConfirm) {
      newErrors.passwordConfirm = 'Veuillez confirmer votre mot de passe';
    } else if (formData.password !== formData.passwordConfirm) {
      newErrors.passwordConfirm = 'Les mots de passe ne correspondent pas';
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error !== '');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({ email: '', password: '', passwordConfirm: '', general: '' });
    setSuccess(false);

    // Client-side validation
    if (!validateForm()) {
      return;
    }

    try {
      await register(formData.email, formData.password);
      
      // Registration successful
      setSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login?registered=true');
      }, 2000);
    } catch (error: unknown) {
      // Handle API errors
      const apiError = error as { response?: { data?: { detail?: string } }; message?: string };
      
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
          general: 'Une erreur est survenue lors de l\'inscription',
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
              Commencez gratuitement
            </h1>
            <p className="text-text-secondary text-lg">Créez votre compte en quelques secondes</p>
          </div>

          {/* Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-border p-8 shadow-xl">
            {success ? (
              <div className="text-center space-y-6 py-4">
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-action to-green-600 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-primary">
                    Bienvenue dans Talentious !
                  </h2>
                  <p className="text-text-secondary">
                    Votre compte a été créé avec succès
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-action"></div>
                  <span>Redirection vers la connexion...</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
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
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-primary mb-2">
                  Mot de passe
                </label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  error={errors.password}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <p className="mt-1 text-xs text-text-secondary">
                  Minimum 8 caractères
                </p>
              </div>

              {/* Password Confirmation */}
              <div>
                <label htmlFor="passwordConfirm" className="block text-sm font-semibold text-primary mb-2">
                  Confirmer le mot de passe
                </label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  value={formData.passwordConfirm}
                  onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                  placeholder="••••••••"
                  error={errors.passwordConfirm}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                className="w-full shadow-lg shadow-action/20 hover:shadow-xl hover:shadow-action/30 transition-all"
                isLoading={isLoading}
                disabled={isLoading}
              >
                {isLoading ? 'Création en cours...' : 'Créer mon compte'}
              </Button>
            </form>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="text-center mt-6 space-y-4">
            <p className="text-text-secondary">
              Vous avez déjà un compte ?{' '}
              <Link href="/login" className="text-action font-semibold hover:underline transition-all">
                Se connecter
              </Link>
            </p>
            
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Retour à l&apos;accueil
            </Link>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
