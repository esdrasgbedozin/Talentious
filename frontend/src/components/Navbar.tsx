'use client';

/**
 * Navbar Component - Talentious
 * Sticky navigation with smooth scroll to sections
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';

interface NavbarProps {
  variant?: 'landing' | 'app' | 'authenticated';
}

export default function Navbar({ variant = 'landing' }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Detect scroll for background change
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isUserMenuOpen && !target.closest('.user-menu-container')) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isUserMenuOpen]);

  // Smooth scroll to section
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 80; // Navbar height
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
    setIsMobileMenuOpen(false);
  };

  // Landing page navbar with section links
  if (variant === 'landing' && pathname === '/') {
    return (
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-white/95 backdrop-blur-md shadow-md'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <div className="flex-shrink-0">
              <Link href="/" className="flex items-center gap-3">
                <Image
                  src="/logos/logo-mark.svg"
                  alt="Talentious"
                  width={56}
                  height={56}
                  className="w-14 h-14 md:w-16 md:h-16 drop-shadow-md"
                />
                <span className="text-2xl font-bold bg-gradient-to-r from-primary to-action bg-clip-text text-transparent">
                  Talentious
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <button
                onClick={() => scrollToSection('features')}
                className="text-primary hover:text-action transition-colors font-medium"
              >
                Fonctionnalités
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-primary hover:text-action transition-colors font-medium"
              >
                Comment ça marche
              </button>
              <button
                onClick={() => scrollToSection('security')}
                className="text-primary hover:text-action transition-colors font-medium"
              >
                Sécurité
              </button>
              <button
                onClick={() => scrollToSection('testimonials')}
                className="text-primary hover:text-action transition-colors font-medium"
              >
                Témoignages
              </button>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Se connecter
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm" className="shadow-lg shadow-action/20">
                  Créer un compte
                </Button>
              </Link>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-primary p-2"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-border shadow-lg">
            <div className="px-4 py-6 space-y-4">
              <button
                onClick={() => scrollToSection('features')}
                className="block w-full text-left text-primary hover:text-action transition-colors font-medium py-2"
              >
                Fonctionnalités
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="block w-full text-left text-primary hover:text-action transition-colors font-medium py-2"
              >
                Comment ça marche
              </button>
              <button
                onClick={() => scrollToSection('security')}
                className="block w-full text-left text-primary hover:text-action transition-colors font-medium py-2"
              >
                Sécurité
              </button>
              <button
                onClick={() => scrollToSection('testimonials')}
                className="block w-full text-left text-primary hover:text-action transition-colors font-medium py-2"
              >
                Témoignages
              </button>
              <div className="pt-4 border-t border-border space-y-2">
                <Link href="/login" className="block">
                  <Button variant="outline" size="sm" className="w-full">
                    Se connecter
                  </Button>
                </Link>
                <Link href="/register" className="block">
                  <Button variant="primary" size="sm" className="w-full">
                    Créer un compte
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    );
  }

  // Authenticated variant (for dashboard, profile, onboarding pages)
  if (variant === 'authenticated') {
    const handleLogout = async () => {
      await logout();
      router.push('/login');
    };

    // Get user initials from email (first 2 letters before @)
    const initials = user?.email 
      ? user.email.split('@')[0].slice(0, 2).toUpperCase()
      : 'U';

    return (
      <nav className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? 'bg-white/95 backdrop-blur-sm shadow-md' 
          : 'bg-white border-b border-gray-200'
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/profile" className="flex items-center gap-3">
              <Image
                src="/logos/logo-mark.svg"
                alt="Talentious"
                width={56}
                height={56}
                className="w-14 h-14 md:w-16 md:h-16 drop-shadow-md"
              />
              <span className="text-xl font-bold text-gray-900">Talentious</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              <Link 
                href="/profile"
                className={`text-sm font-medium transition-colors ${
                  pathname === '/profile' 
                    ? 'text-[#38A169]' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Mon Profil
              </Link>
              <Link 
                href="/dashboard"
                className={`text-sm font-medium transition-colors ${
                  pathname === '/dashboard' 
                    ? 'text-[#38A169]' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Mes CV
              </Link>
            </div>

            {/* User Menu */}
            <div className="relative user-menu-container">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#38A169] to-[#2F855A] flex items-center justify-center text-white font-semibold text-sm shadow-md">
                  {initials}
                </div>
                {/* User Info (Desktop only) */}
                <div className="hidden md:block text-left">
                  <div className="text-sm font-medium text-gray-900">
                    {user?.email.split('@')[0] || 'Utilisateur'}
                  </div>
                  <div className="text-xs text-gray-500">{user?.email}</div>
                </div>
                {/* Dropdown Icon */}
                <svg 
                  className={`w-4 h-4 text-gray-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
                  {/* Mobile: Show user info */}
                  <div className="md:hidden px-4 py-3 border-b border-gray-100">
                    <div className="font-medium text-gray-900">{user?.email.split('@')[0] || 'Utilisateur'}</div>
                    <div className="text-sm text-gray-500">{user?.email}</div>
                  </div>

                  {/* Mobile: Navigation links */}
                  <div className="md:hidden border-b border-gray-100">
                    <Link 
                      href="/profile"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Mon Profil
                      </div>
                    </Link>
                    <Link 
                      href="/dashboard"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Mes CV
                      </div>
                    </Link>
                  </div>

                  {/* Settings */}
                  <Link 
                    href="/settings"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Paramètres
                    </div>
                  </Link>

                  {/* Logout */}
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Se déconnecter
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Simple navbar for auth pages
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logos/logo-mark.svg"
              alt="Talentious"
              width={56}
              height={56}
              className="w-14 h-14 md:w-16 md:h-16 drop-shadow-md"
            />
            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-action bg-clip-text text-transparent">
              Talentious
            </span>
          </Link>

          <div className="flex items-center gap-4">
            {pathname === '/login' ? (
              <>
                <span className="text-sm text-text-secondary hidden sm:inline">Pas encore de compte ?</span>
                <Link href="/register">
                  <Button variant="primary" size="sm">
                    Créer un compte
                  </Button>
                </Link>
              </>
            ) : pathname === '/register' ? (
              <>
                <span className="text-sm text-text-secondary hidden sm:inline">Déjà inscrit ?</span>
                <Link href="/login">
                  <Button variant="outline" size="sm">
                    Se connecter
                  </Button>
                </Link>
              </>
            ) : (
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Se connecter
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
