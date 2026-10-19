/**
 * Non-régression du rendu de CVRenderer (M0-T08).
 *
 * But : prouver que l'EXTRACTION de CVRenderer vers @talentious/cv-render ne
 * change pas le HTML produit. Les snapshots sont capturés depuis le composant
 * d'origine (frontend), puis l'import bascule vers le package : les snapshots
 * doivent rester identiques (aucune mise à jour).
 */
import { render } from '@testing-library/react';
import { CVRenderer } from '@talentious/cv-render';
import { profileFixtures } from '../__fixtures__/profile-fixtures';

beforeAll(() => {
  // CVRenderer instancie un ResizeObserver (absent de jsdom).
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('CVRenderer — non-régression du rendu (extraction M0-T08)', () => {
  it.each(Object.entries(profileFixtures))(
    'rend le CV « %s » à l\'identique',
    (_name, profile) => {
      const { container } = render(<CVRenderer profile={profile} />);
      expect(container.innerHTML).toMatchSnapshot();
    },
  );
});

describe('CVRenderer — réduction d\'échelle pour tenir sur une page (fit-to-page)', () => {
  // jsdom ne calcule pas les layouts : scrollHeight vaut 0, donc le chemin de
  // fit() (le seul comportement non trivial du composant) n'est jamais exercé
  // par les snapshots. On stube scrollHeight au-delà de la hauteur A4 utile pour
  // forcer l'émission d'un transform: scale(...) et figer ce comportement.
  let original: PropertyDescriptor | undefined;

  beforeAll(() => {
    original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 2400, // > hauteur A4 utile (~1017px) ⇒ scale plafonné à MIN_SCALE
    });
  });

  afterAll(() => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original);
    } else {
      delete (HTMLElement.prototype as unknown as { scrollHeight?: number }).scrollHeight;
    }
  });

  it('applique un transform: scale(<1) quand le contenu déborde', () => {
    const { container } = render(<CVRenderer profile={profileFixtures.dense} />);
    const scaled = container.querySelector<HTMLElement>('[style*="scale"]');
    expect(scaled).not.toBeNull();
    const match = /scale\(([0-9.]+)\)/.exec(scaled!.style.transform);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThan(1);
  });
});
