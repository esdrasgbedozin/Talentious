'use client';

/**
 * ATSScorePanel — Score ATS d'un CV face à une offre (M5-T12/T13/T14/T15).
 *
 * Sobre, sans gamification : un score 0-100 déterministe (calculé côté serveur,
 * ADR-ATS-DETERMINISTIC), les mots-clés de l'offre présents / manquants, et un
 * avertissement honnête (D10). Le palier gratuit reçoit un détail tronqué
 * (`detail_truncated`) : on affiche alors le décompte réel des manquants + une
 * invite au Pass, et seulement d'éventuels mots-clés RÉELS fournis par le
 * serveur, jamais de faux contenu flouté. Le gate premium est tranché par le
 * serveur ; ce composant ne fait que lire le booléen.
 */

import { useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import {
  computeAtsScore,
  getErrorMessage,
  type ATSKeyword,
  type ATSScoreResult,
} from '@/lib/api';

// Avertissement D10 (formulation tranchée le 2026-11-08). Le test verrouille ce
// texte EXACT : toute reformulation est une décision produit, pas un détail.
export const ATS_DISCLAIMER =
  'Score indicatif : il compte les mots-clés de l’offre présents dans ton ' +
  'CV pour t’aider à l’ajuster. Il ne garantit pas le passage d’un ' +
  'filtre ATS réel.';

// Même plancher que la génération (GenerateCVModal) : sous ce seuil l'offre est
// trop courte pour une analyse utile.
const MIN_OFFER_CHARS = 50;

// Seuils des bandes d'alignement (nommés plutôt que magiques ; à arbitrer avec
// le produit si la calibration évolue).
const SCORE_GOOD = 70;
const SCORE_MEDIUM = 40;

interface ScoreBand {
  label: string;
  barClass: string;
}

function scoreBand(score: number): ScoreBand {
  if (score >= SCORE_GOOD) return { label: 'Bon alignement', barClass: 'bg-success' };
  if (score >= SCORE_MEDIUM) return { label: 'Alignement moyen', barClass: 'bg-warning' };
  return { label: 'Alignement faible', barClass: 'bg-error' };
}

// Statut HTTP d'une erreur axios par duck-typing : fonctionne pour une vraie
// AxiosError comme pour une erreur mockée en test (axios.isAxiosError renverrait
// false sur cette dernière).
function errorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

function errorToMessage(error: unknown): string {
  const status = errorStatus(error);
  if (status === 502) {
    return 'L’analyse de l’offre est momentanément indisponible. Réessaie dans un instant.';
  }
  if (status === 429) {
    return 'Tu as atteint la limite de scores gratuits. Réessaie plus tard ou prends un Pass.';
  }
  return getErrorMessage(error);
}

interface KeywordChipsProps {
  keywords: ATSKeyword[];
  tone: 'matched' | 'missing';
}

function KeywordChips({ keywords, tone }: KeywordChipsProps) {
  // Teinte portée par la bordure et le fond ; le texte reste en encre primaire
  // pour garantir le contraste AA sur une puce text-xs.
  const toneClass =
    tone === 'matched'
      ? 'border-success/40 bg-success/10'
      : 'border-warning/40 bg-warning/10';
  return (
    <ul className="flex flex-wrap gap-2">
      {keywords.map((kw, i) => (
        <li
          key={`${kw.name}-${i}`}
          className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium text-text-primary ${toneClass}`}
        >
          {kw.name}
        </li>
      ))}
    </ul>
  );
}

interface ATSScorePanelProps {
  cvId: string;
  /** Offre liée au CV (texte de génération), proposée en 1 clic. */
  linkedOfferText?: string | null;
}

export default function ATSScorePanel({
  cvId,
  linkedOfferText,
}: ATSScorePanelProps) {
  const [offerText, setOfferText] = useState('');
  const [result, setResult] = useState<ATSScoreResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedLength = offerText.trim().length;
  const tooShort = trimmedLength < MIN_OFFER_CHARS;
  const canSubmit = !tooShort && !isLoading;
  const linkedOffer = linkedOfferText && linkedOfferText.trim() ? linkedOfferText : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await computeAtsScore(cvId, { offerText: offerText.trim() });
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(errorToMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const counterText = tooShort
    ? `${trimmedLength} / ${MIN_OFFER_CHARS} caractères minimum`
    : `${trimmedLength} caractères`;

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="ats-offer-text"
            className="block text-sm font-medium text-text-primary"
          >
            Texte de l&apos;offre visée
          </label>
          <p className="mt-1 text-sm text-text-secondary">
            Colle l&apos;offre : on compte ses mots-clés qui figurent déjà dans
            ton CV. Rien n&apos;est publié, l&apos;offre sert au calcul.
          </p>
        </div>
        {linkedOffer && (
          <button
            type="button"
            onClick={() => setOfferText(linkedOffer)}
            className="text-sm font-medium text-action underline hover:text-action-hover"
          >
            Utiliser l&apos;offre liée à ce CV
          </button>
        )}
        <textarea
          id="ats-offer-text"
          value={offerText}
          onChange={(e) => setOfferText(e.target.value)}
          rows={8}
          aria-describedby="ats-offer-counter"
          placeholder="Colle ici le texte complet de l'offre d'emploi…"
          className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
        />
        <div className="flex items-center justify-between gap-3">
          <span
            id="ats-offer-counter"
            className={`text-xs ${tooShort ? 'text-error' : 'text-text-secondary'}`}
          >
            {counterText}
          </span>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isLoading}
            disabled={!canSubmit}
          >
            Analyser
          </Button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error"
        >
          {error}
        </div>
      )}

      {/* Région live PERSISTANTE (toujours dans le DOM, remplie ensuite) : une
          région montée avec son contenu n'est pas annoncée de façon fiable. */}
      <div role="status" aria-live="polite">
        {result && !error && <AtsResult result={result} />}
      </div>
    </div>
  );
}

function AtsResult({ result }: { result: ATSScoreResult }) {
  const band = scoreBand(result.score);
  const barWidth = Math.min(100, Math.max(0, result.score));
  return (
    <div className="space-y-4">
      {/* Score : chiffre neutre + jauge teintée, aucune gamification. */}
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-secondary">
              Score d&apos;adéquation
            </p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="text-4xl font-semibold text-text-primary">
                {result.score}
              </span>
              <span className="text-lg text-text-secondary">/ 100</span>
            </p>
          </div>
          <span className="text-sm font-medium text-text-secondary">
            {band.label}
          </span>
        </div>
        <div
          aria-hidden="true"
          className="mt-4 h-2 overflow-hidden rounded-full bg-background-light"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${band.barClass}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <p role="note" className="mt-3 text-xs leading-relaxed text-text-secondary">
          {ATS_DISCLAIMER}
        </p>
      </div>

      {result.detail_truncated ? (
        <TruncatedDetail
          missingCount={result.missing_keywords_count}
          missingKeywords={result.missing_keywords}
        />
      ) : (
        <FullDetail result={result} />
      )}
    </div>
  );
}

function FullDetail({ result }: { result: ATSScoreResult }) {
  const hasMatched = result.matched_keywords.length > 0;
  const hasMissing = result.missing_keywords.length > 0;
  if (!hasMatched && !hasMissing) {
    return (
      <p className="text-sm text-text-secondary">
        Aucun mot-clé exploitable n&apos;a été détecté dans cette offre.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {hasMissing && (
        <section className="space-y-2">
          <h4 className="text-sm font-medium text-text-primary">
            Mots-clés manquants ({result.missing_keywords.length})
          </h4>
          <p className="text-xs text-text-secondary">
            Présents dans l&apos;offre, absents de ton CV. Ajoute ceux qui
            correspondent à ton expérience.
          </p>
          <KeywordChips keywords={result.missing_keywords} tone="missing" />
        </section>
      )}
      {hasMatched && (
        <section className="space-y-2">
          <h4 className="text-sm font-medium text-text-primary">
            Mots-clés présents ({result.matched_keywords.length})
          </h4>
          <KeywordChips keywords={result.matched_keywords} tone="matched" />
        </section>
      )}
    </div>
  );
}

interface TruncatedDetailProps {
  missingCount: number;
  // Le contrat autorise une liste partielle RÉELLE au palier gratuit (D3
  // ouverte) ; aujourd'hui le serveur la laisse vide, mais on l'affiche si elle
  // vient (vrais mots-clés, donc non trompeurs).
  missingKeywords: ATSKeyword[];
}

function TruncatedDetail({ missingCount, missingKeywords }: TruncatedDetailProps) {
  if (missingCount === 0) {
    return (
      <p className="text-sm text-text-secondary">
        Aucun mot-clé manquant détecté sur ce palier.
      </p>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-text-primary">
      <p className="font-medium">
        Il manque {missingCount}{' '}
        {missingCount > 1 ? 'mots-clés' : 'mot-clé'} de l&apos;offre dans ton CV.
      </p>
      {missingKeywords.length > 0 && (
        <div className="space-y-2">
          <p>Quelques-uns, à titre d&apos;aperçu :</p>
          <KeywordChips keywords={missingKeywords} tone="missing" />
        </div>
      )}
      <p>
        Avec un Pass actif, tu vois tous les mots-clés manquants et ceux déjà
        présents, pour ajuster ton CV offre par offre.
      </p>
      <Link href="/billing" className="inline-block font-medium underline">
        Voir les Pass
      </Link>
    </div>
  );
}
