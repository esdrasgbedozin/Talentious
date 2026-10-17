/**
 * Traduction des erreurs de validation (RFC 7807 `invalid_params`) en messages
 * naturels pour l'utilisateur.
 *
 * Le backend renvoie `invalid_params: [{ loc, msg, type }]` où `type` est le
 * code Pydantic (stable, machine-lisible — ex. `missing`,
 * `string_pattern_mismatch`). On mappe sur `type` + le champ ciblé, jamais sur
 * le `msg` anglais technique, pour produire des phrases du type :
 *   « La date de début du projet nº 1 doit être au format AAAA-MM (ex. 2024-03). »
 */

export interface InvalidParam {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
}

// Collection → forme « de … » directement contractée (de le → du, etc.).
const SECTION_OF: Record<string, string> = {
  experiences: 'de l’expérience',
  educations: 'de la formation',
  projects: 'du projet',
  certifications: 'de la certification',
  languages: 'de la langue',
  skills: 'des compétences',
};

// Dernier segment (nom du champ) → libellé lisible, avec article.
const FIELD_LABELS: Record<string, string> = {
  start_date: 'la date de début',
  end_date: 'la date de fin',
  issue_date: 'la date d’obtention',
  expiration_date: 'la date d’expiration',
  url: 'l’URL',
  credential_url: 'l’URL du justificatif',
  credential_id: 'l’identifiant du justificatif',
  linkedin: 'l’URL LinkedIn',
  email: 'l’email',
  phone: 'le téléphone',
  first_name: 'le prénom',
  last_name: 'le nom',
  name: 'le nom',
  title: 'l’intitulé',
  company: 'l’entreprise',
  institution: 'l’établissement',
  degree: 'le diplôme',
  field: 'le domaine',
  level: 'le niveau',
  summary: 'le résumé',
  description: 'la description',
  city: 'la ville',
  country: 'le pays',
  postal_code: 'le code postal',
  address: 'l’adresse',
  grade: 'la mention',
  role: 'le rôle',
  issuer: 'l’organisme émetteur',
};

const DATE_FIELDS = new Set([
  'start_date',
  'end_date',
  'issue_date',
  'expiration_date',
]);
const URL_FIELDS = new Set(['url', 'credential_url', 'linkedin']);

/** Retire les segments d'enveloppe (`body`, `profile_data`) du chemin. */
function cleanLoc(loc: (string | number)[]): (string | number)[] {
  return loc.filter((x) => x !== 'body' && x !== 'profile_data');
}

/** Décrit le champ ciblé : « la date de début du projet nº 1 ». */
function describeField(loc: (string | number)[]): string {
  const path = cleanLoc(loc);
  if (path.length === 0) return 'un champ';

  const field = String(path[path.length - 1]);
  const fieldLabel = FIELD_LABELS[field] ?? `le champ « ${field} »`;

  const section = path.length >= 2 ? String(path[0]) : undefined;
  // personal_info : champs « de surface », le libellé seul suffit et est plus clair.
  if (!section || section === 'personal_info' || !SECTION_OF[section]) {
    return fieldLabel;
  }

  const index = path.find((seg) => typeof seg === 'number') as number | undefined;
  const position = index !== undefined ? ` nº ${index + 1}` : '';
  return `${fieldLabel} ${SECTION_OF[section]}${position}`;
}

/** Décrit le problème selon le type Pydantic et la nature du champ. */
function describeProblem(type: string | undefined, field: string): string {
  if (field === 'email') return 'doit être une adresse email valide';

  switch (type) {
    case 'missing':
      return 'est obligatoire';
    case 'string_pattern_mismatch':
      if (DATE_FIELDS.has(field)) return 'doit être au format AAAA-MM (ex. 2024-03)';
      if (URL_FIELDS.has(field)) return 'doit être une URL valide (https://…)';
      return 'a un format invalide';
    case 'string_too_long':
      return 'dépasse la longueur maximale autorisée';
    case 'too_long':
      return 'comporte trop d’éléments';
    case 'string_too_short':
      return 'est trop court';
    default:
      // URL/date identifiables même sans type pattern explicite.
      if (DATE_FIELDS.has(field)) return 'doit être au format AAAA-MM (ex. 2024-03)';
      if (URL_FIELDS.has(field)) return 'doit être une URL valide (https://…)';
      return 'est invalide';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Traduit chaque `invalid_param` en une phrase française lisible. */
export function translateInvalidParams(params: InvalidParam[]): string[] {
  return params.map((param) => {
    const path = cleanLoc(param.loc ?? []);
    const field = path.length ? String(path[path.length - 1]) : '';
    const subject = describeField(param.loc ?? []);
    const problem = describeProblem(param.type, field);
    return capitalize(`${subject} ${problem}.`);
  });
}

/** Agrège plusieurs erreurs en un message unique pour l'affichage. */
export function formatValidationMessage(
  params: InvalidParam[],
  max = 3,
): string {
  const messages = translateInvalidParams(params);
  if (messages.length === 0) return 'Certains champs sont invalides.';

  const shown = messages.slice(0, max);
  const remaining = messages.length - shown.length;
  const suffix =
    remaining > 0 ? ` (+${remaining} autre${remaining > 1 ? 's' : ''})` : '';
  return shown.join(' ') + suffix;
}
