"use client";

/**
 * CvSheet — coquille A4 PARTAGÉE par tous les templates (M3-T01).
 *
 * Sortie en facteur commun de CVRenderer quand un 2e template est arrivé
 * (corporate_sobre) : la feuille A4 à taille fixe (overflow caché), les
 * variables de thème `--cv-*` posées sur la racine, et surtout l'UNIQUE
 * machinerie de fit une-page + le signal de rendu stable `__CV_READY__` attendu
 * par l'export-service. Un template ne décrit plus que SES sections ; la
 * mécanique (identique pour tous, et jamais dupliquée) vit ici.
 *
 * Garantie « aperçu = PDF » : l'aperçu Next et le Chromium de l'export-service
 * rendent la MÊME boîte fittée (même transform, même origine — cf. fit.ts).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { components } from "../generated/api";
import { themeToCssVars } from "../theme";
import {
  A4_AVAILABLE_CONTENT_HEIGHT_PX,
  A4_GEOMETRY,
  CV_CONTENT_ATTR,
  computeFitScale,
  fitTransform,
  signalCVReady,
  whenFontsReady,
} from "../fit";

type CVThemeTokens = components["schemas"]["CVThemeTokens"];

// A4 geometry and sheet padding (mm) — single source of truth in fit.ts
// (shared with the export-service CDP measurement, M2-T06). Kept in sync with
// the print @page rules.
const A4_WIDTH_MM = A4_GEOMETRY.widthMm;
const A4_HEIGHT_MM = A4_GEOMETRY.heightMm;
const PAD_Y_MM = A4_GEOMETRY.padYMm;
const PAD_X_MM = A4_GEOMETRY.padXMm;

/**
 * Fit une-page + signal de rendu. Mesure la hauteur naturelle (non scalée) du
 * contenu et réduit juste assez pour tenir sur une page A4. `scrollHeight`
 * ignore le transform CSS : mesurer pendant qu'on scale est stable et converge
 * en une passe (pas de boucle de feedback). Un ResizeObserver garde le fit
 * correct quand l'utilisateur édite le CV en direct.
 *
 * `refitKey` : valeur dont tout changement re-déclenche le cycle complet
 * (mesure + re-pose du signal). Les templates y passent `cv`.
 */
function useFitToPage(refitKey: unknown): {
  contentRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
} {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Compteur de cycles « polices prêtes + re-fit commité » : incrémenté (jamais
  // booléen) pour que CHAQUE changement de refitKey re-déclenche l'effet de signal.
  const [fitSettled, setFitSettled] = useState(0);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const availableHeightPx = A4_AVAILABLE_CONTENT_HEIGHT_PX;
    const fit = () => {
      const natural = el.scrollHeight;
      if (!natural) return;
      setScale(computeFitScale(natural, availableHeightPx));
    };
    // Ce fit force un layout (lecture de scrollHeight) AVANT whenFontsReady :
    // c'est ce qui déclenche le chargement des polices utilisées — fonts.ready
    // ne peut pas se résoudre « à vide » (garantie reprise par M0-T16).
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // Polices chargées = métriques finales : re-fit déterministe, PUIS signal
    // de rendu stable (effet [fitSettled] ci-dessous — posé après le commit DOM
    // du re-fit, jamais avant). `finally` : même si fit() lève, le signal part
    // — un export ne reste pas suspendu (revue sécurité T14+T15).
    let cancelled = false;
    void whenFontsReady(document).then(() => {
      if (cancelled) return;
      try {
        fit();
      } finally {
        setFitSettled((n) => n + 1);
      }
    });
    return () => {
      cancelled = true;
      ro.disconnect();
      // Démontage ou changement de cv : retirer le signal — un waitForFunction
      // ne doit jamais lire un signal périmé (reposé à la fin du nouveau cycle).
      delete window.__CV_READY__;
    };
  }, [refitKey]);

  useEffect(() => {
    if (fitSettled > 0) signalCVReady(window);
  }, [fitSettled]);

  return { contentRef, scale };
}

export interface CvSheetProps {
  /** Snapshot de thème du document (contrat `CVThemeTokens`). Absent : défaut
   * anthracite quasi-monochrome (D2). */
  theme?: CVThemeTokens | null;
  /** Valeur re-déclenchant le fit (les templates passent `cv`). */
  refitKey: unknown;
  /** Classes utilitaires de la boîte de contenu mesurable (taille/interligne de
   * base, propres au template). */
  contentClassName: string;
  children: React.ReactNode;
}

export function CvSheet({
  theme,
  refitKey,
  contentClassName,
  children,
}: CvSheetProps) {
  const { contentRef, scale } = useFitToPage(refitKey);
  return (
    <div
      className="cv-sheet relative mx-auto overflow-hidden"
      style={{
        ...themeToCssVars(theme),
        width: `${A4_WIDTH_MM}mm`,
        height: `${A4_HEIGHT_MM}mm`,
        backgroundColor: "var(--cv-background)",
        color: "var(--cv-text)",
        fontFamily: "var(--cv-font-body)",
      }}
    >
      <div style={{ padding: `${PAD_Y_MM}mm ${PAD_X_MM}mm` }}>
        <div
          ref={contentRef}
          {...{ [CV_CONTENT_ATTR]: "true" }}
          className={contentClassName}
          style={fitTransform(scale)}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
