import {
  translateInvalidParams,
  formatValidationMessage,
  type InvalidParam,
} from '@/lib/validationErrors';

const p = (loc: (string | number)[], type: string, msg = ''): InvalidParam => ({
  loc,
  type,
  msg,
});

describe('translateInvalidParams', () => {
  it('traduit un mauvais format de date de projet en message naturel', () => {
    const [msg] = translateInvalidParams([
      p(['body', 'profile_data', 'projects', 0, 'start_date'], 'string_pattern_mismatch'),
    ]);
    expect(msg).toBe(
      'La date de début du projet nº 1 doit être au format AAAA-MM (ex. 2024-03).',
    );
  });

  it('indexe correctement (nº = index + 1) et choisit la bonne section', () => {
    const [msg] = translateInvalidParams([
      p(['body', 'profile_data', 'experiences', 2, 'end_date'], 'string_pattern_mismatch'),
    ]);
    expect(msg).toBe(
      'La date de fin de l’expérience nº 3 doit être au format AAAA-MM (ex. 2024-03).',
    );
  });

  it('traduit un champ obligatoire manquant', () => {
    const [msg] = translateInvalidParams([
      p(['body', 'profile_data', 'experiences', 0, 'title'], 'missing'),
    ]);
    expect(msg).toBe('L’intitulé de l’expérience nº 1 est obligatoire.');
  });

  it('traduit une URL invalide', () => {
    const [msg] = translateInvalidParams([
      p(['body', 'profile_data', 'projects', 0, 'url'], 'string_pattern_mismatch'),
    ]);
    expect(msg).toBe('L’URL du projet nº 1 doit être une URL valide (https://…).');
  });

  it('traduit un email invalide (personal_info, sans section lourde)', () => {
    const [msg] = translateInvalidParams([
      p(['body', 'profile_data', 'personal_info', 'email'], 'value_error'),
    ]);
    expect(msg).toBe('L’email doit être une adresse email valide.');
  });

  it('traduit un champ trop long', () => {
    const [msg] = translateInvalidParams([
      p(['body', 'profile_data', 'summary'], 'string_too_long'),
    ]);
    expect(msg).toBe('Le résumé dépasse la longueur maximale autorisée.');
  });

  it('reste lisible pour un champ inconnu (pas de chemin technique brut)', () => {
    const [msg] = translateInvalidParams([
      p(['body', 'profile_data', 'projects', 0, 'wat'], 'value_error'),
    ]);
    expect(msg).toContain('du projet nº 1');
    expect(msg).not.toContain('profile_data');
    expect(msg).not.toContain('body');
  });
});

describe('formatValidationMessage', () => {
  it('joint jusqu’à 3 messages et compte le reste', () => {
    const out = formatValidationMessage([
      p(['body', 'profile_data', 'projects', 0, 'start_date'], 'string_pattern_mismatch'),
      p(['body', 'profile_data', 'experiences', 0, 'title'], 'missing'),
      p(['body', 'profile_data', 'personal_info', 'email'], 'value_error'),
      p(['body', 'profile_data', 'summary'], 'string_too_long'),
    ]);
    expect(out).toContain('La date de début du projet nº 1');
    expect(out).toContain('(+1 autre)');
  });

  it('a un repli propre sans paramètres', () => {
    expect(formatValidationMessage([])).toBe('Certains champs sont invalides.');
  });
});
