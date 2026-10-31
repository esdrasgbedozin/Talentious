/**
 * Traduction des erreurs d'export (RFC 7807 `application/problem+json`) en
 * messages FR au TUTOIEMENT (DEC-D11). On mappe d'abord sur le `type` stable du
 * Problem (la copie UI reste maîtresse du ton), puis, pour un type inconnu, sur
 * le STATUT HTTP — jamais sur le `detail` serveur brut, qui est générique et en
 * anglais sur ce flux (revues qualité + sécurité S2). Seuls les 422 à
 * `invalid_params` repassent par le helper générique (déjà traduit en FR).
 *
 * Types couverts (contrat openapi.yaml, base `https://talentious.fr/errors/`) :
 * export / téléchargement de fichier → 409, 404, 402 (variantes premium).
 */
import axios from 'axios';
import { getErrorMessage, type ApiError } from './api';

const ERROR_TYPE_PREFIX = 'https://talentious.fr/errors/';

const GENERIC_MESSAGE = "L'export a échoué. Réessaie dans un instant.";

/** `type` RFC 7807 (sans le préfixe) → message FR tutoyé. */
const MESSAGES_BY_TYPE: Record<string, string> = {
  'job-in-progress':
    "Un export de ce CV est déjà en cours. Patiente un instant avant d'en relancer un.",
  'not-found':
    "Ce CV ou son fichier est introuvable. Relance l'export pour régénérer le PDF.",
  // Les variantes 402 sont, sur ce flux, interceptées en amont (redirection
  // /billing) ; on les garde cartographiées pour toute réutilisation du mapper.
  'career-pass-required': 'Un pass actif est nécessaire pour cette action.',
  'premium-template-required':
    "Ce modèle est réservé aux détenteurs d'un pass actif.",
  'premium-theme-required':
    "Ce thème personnalisé est réservé aux détenteurs d'un pass actif.",
  'premium-language-required':
    "L'export dans cette langue nécessite un pass actif.",
  'variant-limit-reached': 'Tu as atteint la limite de variantes pour ce CV.',
};

/** Repli FR tutoyé par statut HTTP, pour un `type` non cartographié. */
const messageForStatus = (status: number | undefined): string => {
  if (status === 429) {
    return "Trop de demandes d'un coup. Patiente un instant avant de réessayer.";
  }
  if (status !== undefined && status >= 500) {
    return 'Le service est momentanément indisponible. Réessaie dans un instant.';
  }
  return GENERIC_MESSAGE;
};

/**
 * Message utilisateur traduit pour une erreur d'export, quelle que soit sa
 * forme (erreur axios RFC 7807, `Error` métier levée par le flux, ou valeur
 * inconnue).
 */
export const getExportErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const problem = error.response?.data as
      (ApiError & { type?: string; invalid_params?: unknown[] }) | undefined;

    const rawType = problem?.type;
    if (typeof rawType === 'string') {
      const slug = rawType.startsWith(ERROR_TYPE_PREFIX)
        ? rawType.slice(ERROR_TYPE_PREFIX.length)
        : rawType;
      const mapped = MESSAGES_BY_TYPE[slug];
      if (mapped) return mapped;
    }

    // 422 : messages de champ déjà traduits en FR par le helper générique.
    if (
      Array.isArray(problem?.invalid_params) &&
      problem.invalid_params.length > 0
    ) {
      return getErrorMessage(error);
    }

    // Sans connexion au serveur (réseau coupé, requête annulée côté transport).
    if (!error.response) {
      return 'Connexion au service impossible. Vérifie ta connexion et réessaie.';
    }

    return messageForStatus(error.response.status);
  }

  if (error instanceof Error) return error.message;

  return GENERIC_MESSAGE;
};
