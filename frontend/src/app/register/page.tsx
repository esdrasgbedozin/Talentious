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
    <div className="min-h-screen bg-gradient-to-br from-background-light to-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-bold text-primary mb-2">Talentious</h1>
          </Link>
          <p className="text-text-secondary">Créez votre compte</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg border border-border p-8 shadow-sm">
          {success ? (
            <div className="text-center space-y-4">
              <div className="text-5xl">✅</div>
              <h2 className="text-xl font-semibold text-primary">
                Compte créé avec succès !
              </h2>
              <p className="text-text-secondary">
                Redirection vers la page de connexion...
              </p>
            </div>
          ) : (
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
                  autoComplete="new-password"
                />
                <p className="mt-1 text-xs text-text-secondary">
                  Minimum 8 caractères
                </p>
              </div>

              {/* Password Confirmation */}
              <div>
                <label htmlFor="passwordConfirm" className="block text-sm font-medium text-text-primary mb-2">
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
                className="w-full"
                isLoading={isLoading}
                disabled={isLoading}
              >
                {isLoading ? 'Création...' : 'Créer mon compte'}
              </Button>
            </form>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <p className="text-center text-sm text-text-secondary mt-6">
            Vous avez déjà un compte ?{' '}
            <Link href="/login" className="text-action font-medium hover:underline">
              Se connecter
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
