import Link from 'next/link';
import type { ReactNode } from 'react';

/** Shared chrome for the public legal pages: light header, reading column, footer nav. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background-light">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold text-primary">
            Talentious
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-text-secondary transition-colors hover:text-primary"
          >
            ← Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">{children}</main>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-6 text-sm text-text-secondary">
          <Link href="/legal/mentions-legales" className="transition-colors hover:text-primary">
            Mentions légales
          </Link>
          <Link href="/legal/confidentialite" className="transition-colors hover:text-primary">
            Confidentialité
          </Link>
          <Link href="/legal/cgu" className="transition-colors hover:text-primary">
            CGU
          </Link>
          <span className="ml-auto text-text-secondary/70">© 2026 Talentious</span>
        </div>
      </footer>
    </div>
  );
}
