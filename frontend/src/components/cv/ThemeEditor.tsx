'use client';

import { useId, useState } from 'react';
import { CV_FONT_FAMILIES } from '@talentious/cv-render';
import type { components } from '@/generated/api';

type CVThemeTokens = components['schemas']['CVThemeTokens'];
type CVFontFamily = components['schemas']['CVFontFamily'];

type ColorKey =
  | 'color_text'
  | 'color_muted'
  | 'color_accent'
  | 'color_background';
type FontKey = 'font_heading' | 'font_body';

// Miroir EXACT du contrat (HexColor) et de la ceinture du package (safeColor).
// L'autorité de validation reste le serveur (theme_validation.py, M1-T09) :
// ceci n'est que l'ergonomie, on refuse tôt pour ne jamais pousser un hex
// invalide au parent.
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const HEX_ERROR = 'Code couleur invalide. Format attendu : #RRGGBB.';

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: 'color_text', label: 'Couleur du texte' },
  { key: 'color_muted', label: 'Couleur du texte atténué' },
  { key: 'color_accent', label: "Couleur d'accent" },
  { key: 'color_background', label: 'Couleur de fond' },
];

const COLOR_KEYS: ColorKey[] = COLOR_FIELDS.map((f) => f.key);

const FONT_FIELDS: { key: FontKey; label: string }[] = [
  { key: 'font_heading', label: 'Police des titres' },
  { key: 'font_body', label: 'Police du texte courant' },
];

// Garde runtime : le critère « police hors liste impossible » ne repose alors
// plus seulement sur la structure du <select> mais aussi sur le code.
const isFontFamily = (value: string): value is CVFontFamily =>
  (CV_FONT_FAMILIES as readonly string[]).includes(value);

export interface ThemeEditorProps {
  /** Tokens courants (toujours valides : le parent ne reçoit que du valide). */
  tokens: CVThemeTokens;
  /** Appelé UNIQUEMENT avec des tokens valides (hex refusé = pas d'appel). */
  onChange: (next: CVThemeTokens) => void;
  /** Verrouille tous les champs (ex. sauvegarde en vol côté parent). */
  disabled?: boolean;
}

/**
 * Éditeur de thème CV : 4 couleurs (hex #RRGGBB) + 2 polices choisies dans
 * l'allowlist. Présentationnel et contrôlé : le parent possède l'état et la
 * persistance (PUT d'enveloppe, M3-T11). L'indicateur de contraste en direct
 * est ajouté séparément (M3-T10).
 */
export default function ThemeEditor({
  tokens,
  onChange,
  disabled = false,
}: ThemeEditorProps) {
  const baseId = useId();
  // Brouillon local des champs texte : l'utilisateur peut taper un état
  // intermédiaire invalide à l'écran sans qu'il ne remonte au parent.
  const [drafts, setDrafts] = useState<Record<ColorKey, string>>(() => ({
    color_text: tokens.color_text,
    color_muted: tokens.color_muted,
    color_accent: tokens.color_accent,
    color_background: tokens.color_background,
  }));
  const [errors, setErrors] = useState<Record<ColorKey, boolean>>({
    color_text: false,
    color_muted: false,
    color_accent: false,
    color_background: false,
  });

  // Resynchronisation contrôlée : si le parent remplace un token de l'extérieur
  // (reset, changement de document, retour arrière après un PUT en échec), on
  // réaligne le brouillon du champ concerné SANS écraser une saisie en cours
  // sur les autres champs. Pattern « tokens précédents en state » (setState
  // pendant le rendu, pas de useEffect qui clignote).
  const [prevTokens, setPrevTokens] = useState(tokens);
  if (tokens !== prevTokens) {
    setPrevTokens(tokens);
    setDrafts((d) => {
      const next = { ...d };
      for (const k of COLOR_KEYS) {
        if (tokens[k] !== prevTokens[k]) next[k] = tokens[k];
      }
      return next;
    });
    setErrors((e) => {
      const next = { ...e };
      for (const k of COLOR_KEYS) {
        if (tokens[k] !== prevTokens[k]) next[k] = false;
      }
      return next;
    });
  }

  const commitColor = (key: ColorKey, raw: string) => {
    setDrafts((d) => ({ ...d, [key]: raw }));
    if (HEX_RE.test(raw)) {
      setErrors((e) => ({ ...e, [key]: false }));
      // Normalisation en majuscules, cohérente avec DEFAULT_CV_THEME_TOKENS.
      onChange({ ...tokens, [key]: raw.toUpperCase() });
    } else {
      // Hex invalide : on le signale et on NE propage PAS (le parent garde la
      // dernière valeur valide).
      setErrors((e) => ({ ...e, [key]: true }));
    }
  };

  const handleFont = (key: FontKey, value: string) => {
    // <select> fermé sur l'allowlist + garde runtime : une police hors liste
    // (valeur forgée, appel programmatique) est ignorée, jamais propagée.
    if (!isFontFamily(value)) return;
    onChange({ ...tokens, [key]: value });
  };

  return (
    <fieldset disabled={disabled} className="m-0 space-y-6 border-0 p-0">
      <legend className="sr-only">Thème du CV</legend>

      <div className="space-y-4">
        {COLOR_FIELDS.map(({ key, label }) => {
          const draft = drafts[key];
          const invalid = errors[key];
          const inputId = `${baseId}-${key}`;
          const errorId = `${inputId}-error`;
          // La pastille native n'accepte qu'un hex valide : on retombe sur le
          // dernier token valide tant que le brouillon ne l'est pas.
          const swatch = HEX_RE.test(draft) ? draft : tokens[key];
          return (
            <div key={key} className="flex flex-col gap-1">
              <label
                htmlFor={inputId}
                className="text-sm font-medium text-gray-700"
              >
                {label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${label} (pastille)`}
                  value={swatch}
                  onChange={(e) => commitColor(key, e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                />
                <input
                  id={inputId}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={7}
                  placeholder="#RRGGBB"
                  value={draft}
                  onChange={(e) => commitColor(key, e.target.value)}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? errorId : undefined}
                  className="w-28 rounded border border-gray-300 px-2 py-1 font-mono text-sm uppercase"
                />
              </div>
              {invalid && (
                <p id={errorId} role="alert" className="text-xs text-red-600">
                  {HEX_ERROR}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        {FONT_FIELDS.map(({ key, label }) => {
          const selectId = `${baseId}-${key}`;
          return (
            <div key={key} className="flex flex-col gap-1">
              <label
                htmlFor={selectId}
                className="text-sm font-medium text-gray-700"
              >
                {label}
              </label>
              <select
                id={selectId}
                value={tokens[key]}
                onChange={(e) => handleFont(key, e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              >
                {CV_FONT_FAMILIES.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
