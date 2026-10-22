/**
 * M0-T15 — Signal `window.__CV_READY__` posé APRÈS `fonts.ready` et APRÈS
 * l'ajustement (re-fit aux métriques finales des polices).
 *
 * C'est le point d'attente de l'export-service (M2) : Chromium attend
 * `window.__CV_READY__ === true` avant `page.pdf()`. Garanties testées ici :
 * - le signal n'existe PAS tant que les polices ne sont pas prêtes ;
 * - quand il apparaît, le DOM porte déjà le transform re-calculé après
 *   `fonts.ready` (le PDF ne peut pas capturer un ajustement pré-polices) ;
 * - environnement sans `document.fonts` (jsdom) ou `fonts.ready` rejetée :
 *   le signal est posé quand même — un export ne reste jamais suspendu.
 */
import { act, render } from '@testing-library/react';
import CVRenderer from '../CVRenderer';
import { computeFitScale } from '../fit';
import type { GeneratedCVData } from '../types';
import denseJson from '../../../../fixtures/cv-reference/dense.json';

const dense = denseJson as unknown as GeneratedCVData;

// Géométrie A4 du renderer (CVRenderer.tsx) : hauteur utile en px CSS.
const AVAILABLE_PX = (297 - 2 * 14) * (96 / 25.4);

let naturalHeight = 1200;
let originalScrollHeight: PropertyDescriptor | undefined;

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => naturalHeight,
  });
});

afterAll(() => {
  if (originalScrollHeight) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
  } else {
    delete (HTMLElement.prototype as unknown as { scrollHeight?: number }).scrollHeight;
  }
});

function installFakeFonts(ready: Promise<unknown>) {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready },
  });
}

afterEach(() => {
  delete (window as { __CV_READY__?: true }).__CV_READY__;
  delete (document as { fonts?: unknown }).fonts;
  naturalHeight = 1200;
});

function renderedScale(container: HTMLElement): number {
  const scaled = container.querySelector<HTMLElement>('[style*="scale"]');
  expect(scaled).not.toBeNull();
  const match = /scale\(([0-9.]+)\)/.exec(scaled!.style.transform);
  expect(match).not.toBeNull();
  return Number(match![1]);
}

describe('CVRenderer — __CV_READY__ (M0-T15)', () => {
  it("n'est posé qu'après fonts.ready, et le DOM porte alors le re-fit post-polices", async () => {
    let resolveFonts!: () => void;
    installFakeFonts(new Promise<void>((resolve) => (resolveFonts = resolve)));

    const { container } = render(<CVRenderer cv={dense} />);

    // Ajustement initial appliqué, mais polices pas prêtes : PAS de signal.
    expect(renderedScale(container)).toBeCloseTo(computeFitScale(1200, AVAILABLE_PX), 6);
    expect(window.__CV_READY__).toBeUndefined();

    // Le chargement des polices change les métriques : le contenu grandit.
    naturalHeight = 1400;
    await act(async () => {
      resolveFonts();
    });

    // Signal posé, et l'échelle dans le DOM est bien celle d'APRÈS fonts.ready.
    expect(window.__CV_READY__).toBe(true);
    expect(renderedScale(container)).toBeCloseTo(computeFitScale(1400, AVAILABLE_PX), 6);
  });

  it('environnement sans document.fonts (jsdom) : signal posé quand même', async () => {
    const { container } = render(<CVRenderer cv={dense} />);
    await act(async () => {});
    expect(window.__CV_READY__).toBe(true);
    expect(renderedScale(container)).toBeCloseTo(computeFitScale(1200, AVAILABLE_PX), 6);
  });

  it('fonts.ready rejetée : signal posé quand même (un export ne reste jamais suspendu)', async () => {
    installFakeFonts(Promise.reject(new Error('fonts hs')));
    render(<CVRenderer cv={dense} />);
    await act(async () => {});
    expect(window.__CV_READY__).toBe(true);
  });

  it('changement de cv : signal RETIRÉ pendant le nouveau cycle, puis re-posé', async () => {
    const { rerender } = render(<CVRenderer cv={dense} />);
    await act(async () => {});
    expect(window.__CV_READY__).toBe(true);

    // Nouveau document : le cleanup retire le signal au commit du re-render —
    // un waitForFunction ne peut pas lire le signal de l'ANCIEN document…
    const edited = { ...dense, summary: 'Profil édité' } as GeneratedCVData;
    rerender(<CVRenderer cv={edited} />);
    expect(window.__CV_READY__).toBeUndefined();

    // …et le nouveau cycle (fonts + re-fit) le re-pose.
    await act(async () => {});
    expect(window.__CV_READY__).toBe(true);
  });

  it('démontage : signal retiré', async () => {
    const { unmount } = render(<CVRenderer cv={dense} />);
    await act(async () => {});
    expect(window.__CV_READY__).toBe(true);
    unmount();
    expect(window.__CV_READY__).toBeUndefined();
  });

  it('démontage pendant fonts.ready : aucun signal (et aucun setState orphelin)', async () => {
    let resolveFonts!: () => void;
    installFakeFonts(new Promise<void>((resolve) => (resolveFonts = resolve)));
    const { unmount } = render(<CVRenderer cv={dense} />);
    unmount();
    await act(async () => {
      resolveFonts();
    });
    expect(window.__CV_READY__).toBeUndefined();
  });
});
