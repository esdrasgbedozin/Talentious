/**
 * M0-T11 — Registre de templates : `template_id` → composant de rendu.
 *
 * Un document porte `template_id` dans son enveloppe (contrat V2). Le registre
 * est l'unique point de résolution id → composant, partagé par l'app (T12) et
 * l'export-service (M2). Deux garanties : un id inconnu/corrompu ne casse JAMAIS
 * le rendu (repli `modern_sobre`, le template gratuit), et les documents V1
 * (stampés `modern_v1` par le cv_worker) résolvent vers `modern_sobre`.
 */
import { render } from '@testing-library/react';
import {
  FALLBACK_TEMPLATE_ID,
  resolveTemplateId,
  getTemplate,
} from './registry';
import CVRenderer from '../CVRenderer';
import type { GeneratedCVData } from '../types';
import completeFixture from '../../../../fixtures/cv-reference/complete.json';

const complete = completeFixture as unknown as GeneratedCVData;

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('resolveTemplateId — repli sûr et alias legacy', () => {
  it('résout un id canonique connu vers lui-même', () => {
    expect(resolveTemplateId('modern_sobre')).toBe('modern_sobre');
  });

  it('alias legacy : modern_v1 (documents V1, défaut du cv_worker) → modern_sobre', () => {
    expect(resolveTemplateId('modern_v1')).toBe('modern_sobre');
  });

  it('id inconnu, vide, absent ou corrompu → repli modern_sobre (jamais de crash)', () => {
    for (const bad of [
      'fancy_2030',
      '',
      '  ',
      null,
      undefined,
      42,
      { id: 'modern_sobre' },
      '<script>alert(1)</script>',
      'MODERN_SOBRE', // la casse ne devine pas : id stable strict
    ]) {
      expect(resolveTemplateId(bad)).toBe(FALLBACK_TEMPLATE_ID);
    }
    expect(FALLBACK_TEMPLATE_ID).toBe('modern_sobre');
  });

  it("ids à risque prototype : les propriétés héritées d'Object.prototype ne traversent jamais", () => {
    // Un template_id corrompu nommant une propriété héritée ne doit ni crasher,
    // ni résoudre vers autre chose que le repli, ni renvoyer une valeur non-composant.
    for (const hostile of [
      '__proto__',
      'constructor',
      'prototype',
      'toString',
      'valueOf',
      'hasOwnProperty',
      'constructor.prototype',
      'modern_sobre ', // espace final : résolution stricte, pas de trim deviné
    ]) {
      expect(resolveTemplateId(hostile)).toBe(FALLBACK_TEMPLATE_ID);
      expect(getTemplate(hostile)).toBe(CVRenderer);
    }
    // Non-chaînes exotiques : Symbol, tableaux (['modern_sobre'] se coercerait en
    // 'modern_sobre' dans un accès par clé — la garde typeof doit l'arrêter avant).
    for (const notAString of [Symbol('modern_sobre'), [], ['modern_sobre']]) {
      expect(resolveTemplateId(notAString)).toBe(FALLBACK_TEMPLATE_ID);
      expect(getTemplate(notAString)).toBe(CVRenderer);
    }
  });
});

describe('getTemplate — id → composant', () => {
  it('modern_sobre (et son alias V1) résolvent vers CVRenderer', () => {
    expect(getTemplate('modern_sobre')).toBe(CVRenderer);
    expect(getTemplate('modern_v1')).toBe(CVRenderer);
    expect(getTemplate('inconnu')).toBe(CVRenderer); // repli
  });

  it('le composant résolu rend un CV réel (smoke, fixture canonique + thème optionnel)', () => {
    const Template = getTemplate(undefined);
    const { container } = render(<Template cv={complete} />);
    expect(container.querySelector('h1')?.textContent).toContain('Camille');
    // La prop theme reste acceptée (orthogonalité template / thème).
    const themed = render(
      <Template
        cv={complete}
        theme={{
          color_accent: '#B45309',
          color_text: '#111827',
          color_muted: '#6B7280',
          color_background: '#FFFFFF',
          font_heading: 'Lora',
          font_body: 'Inter',
        }}
      />,
    );
    expect(themed.container.firstElementChild?.getAttribute('style')).toContain('#B45309');
  });
});
