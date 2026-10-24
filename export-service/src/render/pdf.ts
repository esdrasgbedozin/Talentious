/**
 * M2-T06 — rendu PDF Playwright, séquence ARBITRÉE (ADR-RENDER-SECURITY,
 * décision 6, prouvée par le spike M2-T05) :
 *
 *   setContent → document.fonts.ready → mesure scrollHeight → computeFitScale
 *   PARTAGÉ (la même fonction que l'aperçu Next — « aperçu = PDF ») → scale
 *   posé en style → emulateMedia('print') → page.pdf A4.
 *
 * - Le JS DE PAGE est désactivé (`javaScriptEnabled: false`) et la CSP du
 *   document interdit tout script : le fit passe par CDP (`page.evaluate`),
 *   canal de code de confiance non soumis à la CSP. JAMAIS `bypassCSP`.
 * - Un navigateur UNIQUE par processus (coût de lancement), un CONTEXTE par
 *   requête (isolation) — borne de concurrence et timeouts : M2-T09/T11.
 * - `assertChromiumAvailable()` au démarrage : échec RAPIDE si l'image et
 *   playwright-core sont désalignés (revue T02).
 */
import { existsSync } from "node:fs";

import {
  A4_AVAILABLE_CONTENT_HEIGHT_PX,
  A4_GEOMETRY,
  computeFitScale,
  CV_CONTENT_ATTR,
  fitTransform,
} from "@talentious/cv-render";
import { chromium, type Browser } from "playwright-core";

import { createSemaphore } from "./semaphore.js";

/** Défauts partagés (server.ts les consomme — une seule source). */
export const DEFAULT_RENDER_CONCURRENCY = 2;
/** Taille de file par défaut : au-delà, QueueFullError ⇒ 503 Retry-After. */
export const DEFAULT_MAX_QUEUE = 8;

export interface PdfRenderer {
  render(html: string): Promise<Buffer>;
  close(): Promise<void>;
  /** false dès que le navigateur est mort (crash/OOM) : /healthz passe à 503
   * et Cloud Run recycle l'instance — sinon un seul contenu pathologique
   * rendrait l'instance définitivement inutilisable (revue T06, C1). */
  isHealthy(): boolean;
}

export interface CreatePdfRendererOptions {
  /** Args Chromium supplémentaires (PROVISOIRE : l'arbitrage sandbox/compensations
   * est M2-T09 — en conteneur local, `--no-sandbox --disable-dev-shm-usage`). */
  launchArgs?: string[];
  /** Appelé si le navigateur meurt (crash/OOM) — pour journaliser côté app. */
  onDisconnected?: () => void;
  /** Appelé pour CHAQUE requête réseau avortée pendant un rendu (M2-T08) :
   * observabilité de l'egress bloqué. L'appelant ne journalise que le
   * HOSTNAME (jamais l'URL complète — contrainte logs sans contenu, T12). */
  onEgressBlocked?: (url: string) => void;
  /** Borne de rendus simultanés (M2-T09) — chaque rendu = un contexte
   * Chromium (RAM). Défaut : 2. */
  maxConcurrentRenders?: number;
  /** Borne de la FILE d'attente (M2-T09) : au-delà, rejet immédiat
   * (QueueFullError ⇒ 503 Retry-After). Défaut : 8. */
  maxQueuedRenders?: number;
}

/**
 * Politique sandbox (M2-T09, ADR-RENDER-SECURITY) : args vérifiés contre la
 * liste blanche, et `--no-sandbox` REFUSÉ si le process tourne root — c'est
 * la compensation vérifiable au démarrage (les autres : egress avorté T08,
 * Option B sans navigation, FS applicatif root-owned, écritures /tmp seul —
 * prouvées par leurs tests et le run conteneur --read-only).
 */
export function validateChromiumLaunch(
  launchArgs: string[],
  uid: number | undefined,
): void {
  const forbidden = launchArgs.filter((arg) => !ALLOWED_CHROMIUM_ARGS.has(arg));
  if (forbidden.length > 0) {
    throw new Error(
      `Args Chromium hors liste blanche refusés : ${forbidden.join(" ")} ` +
        `(autorisés : ${[...ALLOWED_CHROMIUM_ARGS].join(" ")})`,
    );
  }
  if (launchArgs.includes("--no-sandbox") && uid === 0) {
    throw new Error(
      "--no-sandbox est REFUSÉ sous root : sans sandbox Chromium, le non-root " +
        "est la compensation minimale (ADR-RENDER-SECURITY, M2-T09).",
    );
  }
}

/** LISTE BLANCHE des args Chromium acceptés (revue T06, C2) : un argument
 * hostile (--disable-web-security, --remote-debugging-address, --proxy-server…)
 * annulerait les compensations — tout inconnu fait échouer le DÉMARRAGE. */
const ALLOWED_CHROMIUM_ARGS = new Set([
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
]);

/** Échec rapide si le Chromium épinglé de l'image n'est pas là (revue T02). */
export function assertChromiumAvailable(): string {
  const executablePath = chromium.executablePath();
  if (!existsSync(executablePath)) {
    throw new Error(
      `Chromium Playwright introuvable (${executablePath}) : image et playwright-core ` +
        "désalignés (invariant ADR-PDF-RENDER) ou navigateurs non installés " +
        "(`npx playwright-core install chromium` en dev).",
    );
  }
  return executablePath;
}

// Viewport A4 à 96 dpi (≈794×1123) et DPR fixe : géométrie IDENTIQUE d'un
// rendu à l'autre (déterminisme D6 — les métadonnées sont M2-T07), DÉRIVÉE de
// la source unique A4_GEOMETRY (revue T06, A5 : jamais de 794 en dur).
const A4_VIEWPORT = {
  width: Math.round(A4_GEOMETRY.widthMm * A4_GEOMETRY.mmToPx),
  height: Math.round(A4_GEOMETRY.heightMm * A4_GEOMETRY.mmToPx),
};

export async function createPdfRenderer(
  options: CreatePdfRendererOptions = {},
): Promise<PdfRenderer> {
  const launchArgs = options.launchArgs ?? [];
  // uid EFFECTIF d'abord (le sandbox en dépend) ; undefined (Windows dev)
  // = fail-open ASSUMÉ : la prod est un conteneur Linux où geteuid existe.
  validateChromiumLaunch(launchArgs, process.geteuid?.() ?? process.getuid?.());
  assertChromiumAvailable();
  const semaphore = createSemaphore(
    options.maxConcurrentRenders ?? DEFAULT_RENDER_CONCURRENCY,
    options.maxQueuedRenders ?? DEFAULT_MAX_QUEUE,
  );
  const browser: Browser = await chromium.launch({ args: launchArgs });
  let healthy = true;
  browser.on("disconnected", () => {
    healthy = false;
    options.onDisconnected?.();
  });

  async function renderOnce(html: string): Promise<Buffer> {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: A4_VIEWPORT,
      deviceScaleFactor: 1,
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    try {
      // Second verrou RÉSEAU, propre au renderer et indépendant de la CSP du
      // document (revue T06, C4) : toute requête sortante est avortée, et
      // chaque tentative est SIGNALÉE (M2-T08 — test au serveur-témoin :
      // zéro requête reçue ; dernier rempart DET-M0-AC1 pour une URL
      // d'apparence légitime, 169.254.169.254 compris).
      await context.route("**/*", (route) => {
        options.onEgressBlocked?.(route.request().url());
        return route.abort();
      });
      const page = await context.newPage();
      // Média PRINT posé AVANT la mesure (revue T06, S5) : une règle @media
      // print du CSS qui change les hauteurs doit être mesurée telle qu'elle
      // sera IMPRIMÉE — le scale est calculé dans le média final.
      await page.emulateMedia({ media: "print" });
      await page.setContent(html, { waitUntil: "load" });
      // fonts.ready AVANT la mesure : les métriques finales (polices data:,
      // M2-T16) décident de la hauteur naturelle.
      const naturalHeightPx = await page.evaluate(async (attr) => {
        await document.fonts.ready;
        const content = document.querySelector(`[${attr}]`);
        return content ? content.scrollHeight : -1;
      }, CV_CONTENT_ATTR);
      if (naturalHeightPx === -1) {
        // Échec EXPLICITE (revue T06, A4) : un template qui perd le marqueur
        // produirait sinon un PDF multi-pages en silence, sans fit ni log.
        throw new Error(
          `Document sans [${CV_CONTENT_ATTR}] : le fit une-page est impossible — ` +
            "template non conforme au contrat de rendu.",
        );
      }
      const scale = computeFitScale(
        naturalHeightPx,
        A4_AVAILABLE_CONTENT_HEIGHT_PX,
      );
      const { transform, transformOrigin } = fitTransform(scale);
      if (transform) {
        // Le MÊME style que l'aperçu (fitTransform partagé — « aperçu = PDF »).
        await page.evaluate(
          ([attr, t, origin]) => {
            const content = document.querySelector(
              `[${attr}]`,
            ) as HTMLElement | null;
            if (content) {
              content.style.transform = t;
              content.style.transformOrigin = origin;
            }
          },
          [CV_CONTENT_ATTR, transform, transformOrigin] as const,
        );
      }
      return await page.pdf({ format: "A4", printBackground: true });
    } finally {
      // close() qui rejette ne doit jamais MASQUER l'erreur d'origine de
      // page.pdf (revue T06, S3) : avalé, le contexte mort finira avec le
      // navigateur (health → 503 si c'est lui qui est tombé).
      await context.close().catch(() => {});
    }
  }

  return {
    render(html: string): Promise<Buffer> {
      // Échec IMMÉDIAT si le navigateur est mort (revue T09, pt 8) : inutile
      // d'attendre un permis pour échouer — /healthz 503 recycle déjà.
      if (!healthy) {
        return Promise.reject(
          new Error("Navigateur de rendu indisponible (déconnecté)"),
        );
      }
      // Borne de concurrence (M2-T09) : au-delà, les rendus ATTENDENT (FIFO)
      // — jamais un contexte de plus que la limite (OOM navigateur évité).
      return semaphore.run(() => renderOnce(html));
    },

    async close(): Promise<void> {
      await browser.close();
    },

    isHealthy(): boolean {
      return healthy;
    },
  };
}
