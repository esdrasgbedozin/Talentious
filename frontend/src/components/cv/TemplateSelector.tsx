'use client';

/**
 * TemplateSelector — Talentious (M3-T08)
 *
 * Grille de choix du modèle (Template) de CV. Chaque option rend une VIGNETTE
 * réelle via le package de rendu partagé (getTemplate(id) + le CV courant) :
 * l'aperçu du sélecteur partage le moteur de l'aperçu plein et du PDF
 * (invariant « aperçu = PDF »). Le badge Gratuit/Premium est posé AVANT l'action
 * à partir de is_free.
 *
 * Composant présentationnel : aucun appel réseau. La récupération du catalogue
 * et la persistance (PUT de l'enveloppe) vivent dans la page éditeur (inc.3).
 * Les options sont des radios natifs : navigation clavier (flèches) et
 * sémantique de groupe fournies par la plateforme, sans roving tabindex maison.
 */

import { getTemplate, type GeneratedCVData } from '@talentious/cv-render';
import type { CVTemplate } from '@/lib/api';

interface TemplateSelectorProps {
  /** Catalogue servi par GET /cv/templates (gratuits ET premium). */
  templates: CVTemplate[];
  /** Template actuellement appliqué au CV. */
  selectedId: string;
  /** Contenu réel du CV, rendu dans chaque vignette. */
  cv: GeneratedCVData;
  /** Appelé au choix d'un template (la page décide quoi persister). */
  onSelect: (templateId: string) => void;
  /** Template dont la sélection s'enregistre (option désactivée le temps du PUT). */
  busyId?: string | null;
}

// La feuille A4 (210mm, environ 794px) ramenée à la largeur d'une carte. La
// boîte à hauteur fixe + overflow caché montre le haut de la page (en-tête +
// début du contenu), à la manière d'un aperçu de pile.
const THUMB_ZOOM = 0.26;

export default function TemplateSelector({
  templates,
  selectedId,
  cv,
  onSelect,
  busyId,
}: TemplateSelectorProps) {
  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="sr-only">Choisis un modèle de CV</legend>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {templates.map((template) => {
          const Template = getTemplate(template.id);
          const isSelected = template.id === selectedId;
          const isBusy = busyId === template.id;
          return (
            <label
              key={template.id}
              className={
                isBusy ? 'block cursor-wait' : 'block cursor-pointer'
              }
            >
              <input
                type="radio"
                name="cv-template"
                value={template.id}
                checked={isSelected}
                disabled={isBusy}
                onChange={() => onSelect(template.id)}
                className="peer sr-only"
              />
              <div
                aria-busy={isBusy || undefined}
                className={[
                  'flex flex-col overflow-hidden rounded-lg border border-border bg-white transition',
                  'peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-primary',
                  'peer-disabled:opacity-70',
                  isSelected ? '' : 'hover:border-primary/50',
                ].join(' ')}
              >
                <div
                  aria-hidden
                  className="pointer-events-none h-40 overflow-hidden border-b border-border bg-gray-50"
                >
                  <div style={{ zoom: THUMB_ZOOM }}>
                    <Template cv={cv} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {template.name}
                  </span>
                  <span
                    data-badge={template.is_free ? 'free' : 'premium'}
                    className={[
                      'flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                      template.is_free
                        ? 'border border-border text-text-secondary'
                        : 'bg-primary text-white',
                    ].join(' ')}
                  >
                    {template.is_free ? 'Gratuit' : 'Premium'}
                  </span>
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
