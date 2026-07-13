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
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isUserMenuOpen) setIsUserMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
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
    // At the top the navbar floats over the dark hero → light text; once scrolled
    // the bar turns white → dark text.
    const onDark = !isScrolled;
    const navLink = `${onDark ? 'text-white/85' : 'text-primary'} hover:text-action transition-colors font-medium`;
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
                  width={96}
                  height={96}
                  className="w-14 h-14 md:w-16 md:h-16 drop-shadow-md"
                />
                <span className={`text-2xl font-bold ${onDark ? 'text-white' : 'text-primary'}`}>
                  Talentious
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <button
                onClick={() => scrollToSection('features')}
                className={navLink}
              >
                Fonctionnalités
              </button>
              <button
                onClick={() => scrollToSection('how')}
                className={navLink}
              >
                Comment ça marche
              </button>
              <button
                onClick={() => scrollToSection('security')}
                className={navLink}
              >
                Sécurité
              </button>
              <button
                onClick={() => scrollToSection('beta')}
                className={navLink}
              >
                Bêta
              </button>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <Link
                href="/login"
                className={`text-sm font-medium transition-colors ${onDark ? 'text-white/85 hover:text-white' : 'text-primary hover:text-action'}`}
              >
                Se connecter
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
                className={`p-2 ${onDark ? 'text-white' : 'text-primary'}`}
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
                onClick={() => scrollToSection('how')}
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
                onClick={() => scrollToSection('beta')}
                className="block w-full text-left text-primary hover:text-action transition-colors font-medium py-2"
              >
                Bêta
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
                width={96}
                height={96}
                className="w-14 h-14 md:w-16 md:h-16 drop-shadow-md"
              />
              <span className="text-xl font-bold text-text-primary">Talentious</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              <Link 
                href="/profile"
                className={`text-sm font-medium transition-colors ${
                  pathname === '/profile' 
                    ? 'text-action' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Mon Profil
              </Link>
              <Link 
                href="/dashboard"
                className={`text-sm font-medium transition-colors ${
                  pathname === '/dashboard' 
                    ? 'text-action' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Mes CV
              </Link>
            </div>

            {/* User Menu */}
            <div className="relative user-menu-container">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-3 hover:bg-background-light rounded-lg px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-action"
                aria-haspopup="true"
                aria-expanded={isUserMenuOpen}
                aria-label="Menu utilisateur"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-action to-action-hover flex items-center justify-center text-white font-semibold text-sm shadow-md">
                  {initials}
                </div>
                {/* User Info (Desktop only) */}
                <div className="hidden md:block text-left">
                  <div className="text-sm font-medium text-text-primary">
                    {user?.email.split('@')[0] || 'Utilisateur'}
                  </div>
                  <div className="text-xs text-text-secondary">{user?.email}</div>
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
                <div
                  role="menu"
                  aria-label="Menu utilisateur"
                  className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                >
                  {/* Mobile: Show user info */}
                  <div className="md:hidden px-4 py-3 border-b border-gray-100">
                    <div className="font-medium text-text-primary">{user?.email.split('@')[0] || 'Utilisateur'}</div>
                    <div className="text-sm text-text-secondary">{user?.email}</div>
                  </div>

                  {/* Mobile: Navigation links */}
                  <div className="md:hidden border-b border-gray-100">
                    <Link 
                      href="/profile"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="block px-4 py-3 text-sm text-text-primary hover:bg-background-light transition-colors"
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
                      className="block px-4 py-3 text-sm text-text-primary hover:bg-background-light transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Mes CV
                      </div>
                    </Link>
                  </div>

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
              width={96}
              height={96}
              className="w-14 h-14 md:w-16 md:h-16 drop-shadow-md"
            />
            <span className="text-2xl font-bold text-primary">
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
