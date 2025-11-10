'use client';

/**
 * Navbar Component - Talentious
 * Sticky navigation with smooth scroll to sections
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Button from '@/components/ui/Button';

interface NavbarProps {
  variant?: 'landing' | 'app';
}

export default function Navbar({ variant = 'landing' }: NavbarProps) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Detect scroll for background change
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
              <Link href="/" className="flex items-center gap-2">
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

  // Simple navbar for auth pages
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
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
