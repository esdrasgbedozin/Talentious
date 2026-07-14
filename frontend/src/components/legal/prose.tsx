/**
 * Small presentational primitives shared by the legal pages (mentions légales,
 * confidentialité, CGU) so the three read consistently. Content pages: readable
 * prose column, brand-coloured headings, comfortable line length.
 */
import type { ReactNode } from 'react';

export function LegalHeader({ title, updated }: { title: string; updated: string }) {
  return (
    <header className="mb-10 border-b border-border pb-6">
      <h1 className="text-3xl font-bold tracking-tight text-primary">{title}</h1>
      <p className="mt-2 text-sm text-text-secondary">Dernière mise à jour : {updated}</p>
    </header>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

/** Definition-style row for editor / host identity blocks. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <span className="font-medium text-text-primary">{label} : </span>
      {children}
    </p>
  );
}
