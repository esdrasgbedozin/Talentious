import { evaluateThemeContrast, type ContrastField } from '@/lib/themeContrast';
import type { components } from '@/generated/api';

type CVThemeTokens = components['schemas']['CVThemeTokens'];

const LABELS: Record<ContrastField, string> = {
  color_text: 'Texte',
  color_muted: 'Texte atténué',
  color_accent: 'Accent',
};

export interface ThemeContrastProps {
  tokens: CVThemeTokens;
}

/**
 * Indicateur de contraste en direct : pour chaque couleur de premier plan,
 * affiche le ratio WCAG contre le fond et un verdict lisible / insuffisant.
 * Verdicts calés sur le serveur (fixtures partagées, M3-T10). Purement
 * informatif : la décision d'acceptation reste au serveur à l'enregistrement.
 */
export default function ThemeContrast({ tokens }: ThemeContrastProps) {
  const results = evaluateThemeContrast(tokens);
  const failing = results.filter((r) => !r.readable);
  // Une seule annonce concise aux lecteurs d'écran (role=status => aria-live
  // polite + atomic), au lieu de relire la liste entière à chaque frappe.
  const summary =
    failing.length === 0
      ? 'Contraste du thème : toutes les couleurs sont lisibles.'
      : `Contraste du thème : ${failing.length} couleur${
          failing.length > 1 ? 's' : ''
        } à corriger (${failing.map((r) => LABELS[r.field]).join(', ')}).`;

  return (
    <div>
      <p role="status" className="sr-only">
        {summary}
      </p>
      <ul aria-label="Contraste du thème" className="space-y-1">
        {results.map(({ field, ratio, readable }) => {
          const verdict =
            ratio === null
              ? 'Couleur invalide'
              : readable
                ? 'Lisible'
                : 'Contraste insuffisant';
          return (
            <li
              key={field}
              data-field={field}
              data-readable={readable ? 'true' : 'false'}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="text-gray-700">{LABELS[field]} sur le fond</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-gray-600">
                  {ratio === null ? 'n/a' : ratio.toFixed(2)}
                </span>
                <span
                  className={
                    readable
                      ? 'font-medium text-green-700'
                      : 'font-medium text-red-600'
                  }
                >
                  {verdict}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
