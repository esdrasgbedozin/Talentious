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

    try {
      await login(formData.email, formData.password);
      
      // Login successful - redirect handled by useEffect above
      // The useAuth will set isAuthenticated to true
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
          general: 'Email ou mot de passe incorrect',
        }));
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-light to-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-bold text-primary mb-2">Talentious</h1>
          </Link>
          <p className="text-text-secondary">Connectez-vous à votre compte</p>
        </div>

        {/* Success message if just registered */}
        {showRegisteredMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700 text-center">
              ✅ Compte créé avec succès ! Vous pouvez maintenant vous connecter.
            </p>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-lg border border-border p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* General error */}
            {errors.general && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{errors.general}</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
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
              <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-2">
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
                autoComplete="current-password"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
              disabled={isLoading}
            >
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-text-secondary mt-6">
          Pas encore de compte ?{' '}
          <Link href="/register" className="text-action font-medium hover:underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
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
