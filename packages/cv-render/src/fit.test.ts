/**
 * M0-T15 — Auto-fit isolé en fonction PURE testable.
 *
 * `computeFitScale` est la seule source du facteur d'échelle du fit-to-page :
 * déterministe (mêmes entrées ⇒ même sortie), jamais d'agrandissement (plafond 1),
 * plancher MIN_SCALE (lisibilité), neutre (1) sur toute entrée non mesurable —
 * un document hostile ou un environnement sans layout (jsdom, SSR) ne doit
 * jamais produire un transform invalide.
 */
import { computeFitScale, whenFontsReady, FONTS_READY_TIMEOUT_MS, MIN_SCALE } from './fit';

describe('computeFitScale (M0-T15) — ajustement déterministe', () => {
  const AVAILABLE = 1000;

  it('est monotone : plus de contenu ⇒ échelle inférieure ou égale', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const natural of [200, AVAILABLE, 1100, 1300, 1612.5, 5000, 100_000]) {
      const scale = computeFitScale(natural, AVAILABLE);
      expect(scale).toBeLessThanOrEqual(previous);
      previous = scale;
    }
  });

  it("ne dépasse jamais 1 (contenu plus court que la page ⇒ pas d'agrandissement)", () => {
    expect(computeFitScale(500, AVAILABLE)).toBe(1);
    expect(computeFitScale(AVAILABLE, AVAILABLE)).toBe(1);
  });

  it('réduit proportionnellement quand le contenu déborde', () => {
    expect(computeFitScale(1250, AVAILABLE)).toBeCloseTo(0.8, 10);
    expect(computeFitScale(1600, AVAILABLE)).toBeCloseTo(0.625, 10);
  });

  it('plancher MIN_SCALE : un contenu démesuré ne rend pas le CV illisible', () => {
    expect(MIN_SCALE).toBeGreaterThan(0);
    expect(MIN_SCALE).toBeLessThan(1);
    expect(computeFitScale(100_000, AVAILABLE)).toBe(MIN_SCALE);
  });

  it('neutre (1) sur toute mesure non exploitable — jamais NaN/Infinity en sortie', () => {
    const hostiles: [number, number][] = [
      [0, AVAILABLE],
      [-50, AVAILABLE],
      [Number.NaN, AVAILABLE],
      [Number.POSITIVE_INFINITY, AVAILABLE],
      [1200, 0],
      [1200, -10],
      [1200, Number.NaN],
      [1200, Number.POSITIVE_INFINITY],
    ];
    for (const [natural, available] of hostiles) {
      expect(computeFitScale(natural, available)).toBe(1);
    }
  });
});

describe('whenFontsReady (M0-T15) — toujours résolue, jamais suspendue', () => {
  afterEach(() => {
    jest.useRealTimers();
    delete (document as { fonts?: unknown }).fonts;
  });

  function installFonts(ready: unknown) {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
  }

  it('sans document.fonts (jsdom) : résout immédiatement', async () => {
    await expect(whenFontsReady(document)).resolves.toBeUndefined();
  });

  it('fonts.ready rejetée : résout quand même (jamais de rejet propagé)', async () => {
    installFonts(Promise.reject(new Error('fonts hs')));
    await expect(whenFontsReady(document)).resolves.toBeUndefined();
  });

  it('fonts.ready qui ne se règle JAMAIS : résout au timeout (export jamais suspendu)', async () => {
    jest.useFakeTimers();
    installFonts(new Promise(() => {})); // pend pour toujours (police distante)
    let settled = false;
    const p = whenFontsReady(document).then(() => (settled = true));
    await Promise.resolve(); // laisse la micro-queue tourner : rien ne doit se régler
    expect(settled).toBe(false);
    jest.advanceTimersByTime(FONTS_READY_TIMEOUT_MS);
    await p;
    expect(settled).toBe(true);
  });

  it('fonts.ready résolue avant le timeout : résout sans attendre le timer', async () => {
    jest.useFakeTimers();
    installFonts(Promise.resolve());
    await expect(whenFontsReady(document)).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0); // timer nettoyé — pas de handle fuité
  });
});
