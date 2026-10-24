/**
 * Sémaphore à compteur, FIFO, à FILE BORNÉE (M2-T09) — borne la concurrence
 * des rendus : chaque rendu ouvre un contexte Chromium (RAM) ; sans borne,
 * une rafale peut provoquer l'OOM du navigateur (⇒ /healthz 503, instance
 * recyclée). Au-delà de la file, rejet IMMÉDIAT (QueueFullError ⇒ 503
 * Retry-After côté route) : du shedding déterministe et testable en local —
 * la concurrency Cloud Run (M2-T19) fera le même travail côté infra, les
 * timeouts par rendu sont M2-T11.
 */
export interface Semaphore {
  run<T>(task: () => Promise<T>): Promise<T>;
}

/** File pleine : la route traduit en 503 problem+json avec Retry-After. */
export class QueueFullError extends Error {
  constructor(limit: number, maxQueue: number) {
    super(`File de rendu pleine (${limit} actifs + ${maxQueue} en attente)`);
    this.name = "QueueFullError";
  }
}

export function createSemaphore(
  limit: number,
  maxQueue: number = 8,
): Semaphore {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(
      `Limite de concurrence invalide : ${limit} (entier ≥ 1 requis)`,
    );
  }
  if (!Number.isInteger(maxQueue) || maxQueue < 0) {
    throw new Error(
      `Taille de file invalide : ${maxQueue} (entier ≥ 0 requis)`,
    );
  }
  let active = 0;
  const waiting: (() => void)[] = [];

  const release = (): void => {
    active -= 1;
    const next = waiting.shift();
    if (next) next();
  };

  const acquire = (): Promise<void> => {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    if (waiting.length >= maxQueue) {
      return Promise.reject(new QueueFullError(limit, maxQueue));
    }
    return new Promise((resolve) =>
      waiting.push(() => {
        active += 1;
        resolve();
      }),
    );
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
