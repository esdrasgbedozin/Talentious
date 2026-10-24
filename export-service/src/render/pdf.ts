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
/** Échéance GLOBALE d'un rendu, attente en file comprise (M2-T11). */
export const DEFAULT_RENDER_TIMEOUT_MS = 120_000;

export interface RenderCallOptions {
  /** Échéance de CET appel (tests/appels particuliers) — défaut : celle du renderer. */
  timeoutMs?: number;
}

/** Rendu interrompu à l'échéance : la route traduit en 504 problem+json. */
export class RenderTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `Rendu interrompu après ${timeoutMs} ms (échéance globale, file comprise)`,
    );
    this.name = "RenderTimeoutError";
  }
}
/** Taille de file par défaut : au-delà, QueueFullError ⇒ 503 Retry-After. */
export const DEFAULT_MAX_QUEUE = 8;

export interface PdfRenderer {
  render(html: string, options?: RenderCallOptions): Promise<Buffer>;
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
  /** Échéance GLOBALE d'un rendu en ms, ATTENTE EN FILE COMPRISE (M2-T11,
   * contrat ADR décision 7) : à l'expiration, un waiter est retiré de la
   * file, un rendu en cours voit son contexte FERMÉ (le permis est toujours
   * libéré). Défaut : 120 000. */
  renderTimeoutMs?: number;
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
  // Minimum 1 ms ICI (les tests d'échéance en dépendent) ; l'env de PROD est
  // borné à ≥ 1 000 ms par intEnv dans server.ts (revue T11, S5).
  const renderTimeoutMs = options.renderTimeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS;
  if (!Number.isInteger(renderTimeoutMs) || renderTimeoutMs < 1) {
    throw new Error(`renderTimeoutMs invalide : ${renderTimeoutMs}`);
  }
  const browser: Browser = await chromium.launch({ args: launchArgs });
  let healthy = true;
  browser.on("disconnected", () => {
    healthy = false;
    options.onDisconnected?.();
  });

  async function renderOnce(
    html: string,
    signal: AbortSignal,
    timeoutError: RenderTimeoutError,
  ): Promise<Buffer> {
    if (signal.aborted) throw timeoutError;
    // Timeout À L'INTÉRIEUR de la tâche (contrat T09/T11) : la promesse
    // d'échéance PERD une course qui couvre TOUT — newContext compris (revue
    // T11, C2 : un navigateur à moitié mort peut y pendre). Le rejet ne
    // dépend JAMAIS des erreurs CDP (un appel Playwright sur un contexte en
    // fermeture peut PENDRE au lieu de rejeter — constaté sur newPage) ; la
    // fermeture du contexte sert à stopper le travail Chromium. Le permis est
    // libéré par le finally : jamais un rendu pendu qui garde sa place.
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;
    const closeContext = () => void context?.close().catch(() => {});
    let unlisten = () => {};
    const aborted = new Promise<never>((_, reject) => {
      const fail = () => {
        closeContext();
        reject(timeoutError);
      };
      if (signal.aborted) {
        fail();
        return;
      }
      signal.addEventListener("abort", fail, { once: true });
      unlisten = () => signal.removeEventListener("abort", fail);
    });
    const work = (async (): Promise<Buffer> => {
      context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: A4_VIEWPORT,
        deviceScaleFactor: 1,
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      // Contexte né APRÈS l'échéance : le fail() a déjà couru sans rien à
      // fermer — on s'arrête là, le finally ferme.
      if (signal.aborted) throw timeoutError;
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
    })();
    try {
      return await Promise.race([work, aborted]);
    } catch (err) {
      // Le perdant de la course peut rejeter PLUS TARD (contexte fermé) :
      // neutralisé pour ne jamais produire d'unhandled rejection.
      work.catch(() => {});
      // Échéance ⇒ erreur TYPÉE (504), jamais le message CDP interne.
      if (signal.aborted) throw timeoutError;
      throw err;
    } finally {
      unlisten();
      // close() avalé (jamais masquer l'erreur d'origine — revue T06 S3) ET
      // BORNÉ à 5 s (revue T11 S4) : un close qui pend ne doit pas retarder
      // le 504 ni la libération du permis — le contexte orphelin finira avec
      // le navigateur.
      await Promise.race([
        context?.close().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 5_000).unref?.()),
      ]);
    }
  }

  return {
    render(html: string, callOptions?: RenderCallOptions): Promise<Buffer> {
      // Échec IMMÉDIAT si le navigateur est mort (revue T09, pt 8) : inutile
      // d'attendre un permis pour échouer — /healthz 503 recycle déjà.
      if (!healthy) {
        return Promise.reject(
          new Error("Navigateur de rendu indisponible (déconnecté)"),
        );
      }
      // Échéance GLOBALE (M2-T11) : le chrono part ICI — l'attente en file
      // compte. À l'expiration : waiter retiré de la file (signal) OU contexte
      // fermé (rendu en cours). Borne de concurrence : M2-T09.
      const timeoutMs = callOptions?.timeoutMs ?? renderTimeoutMs;
      const timeoutError = new RenderTimeoutError(timeoutMs);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
      return semaphore
        .run(() => renderOnce(html, controller.signal, timeoutError), {
          signal: controller.signal,
        })
        .finally(() => clearTimeout(timer));
    },

    async close(): Promise<void> {
      await browser.close();
    },

    isHealthy(): boolean {
      return healthy;
    },
  };
}
