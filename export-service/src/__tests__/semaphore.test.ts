/**
 * M2-T09 — borne de concurrence des rendus : chaque rendu = un contexte
 * Chromium (RAM) ; sans borne, une rafale de requêtes peut tuer l'instance
 * (OOM ⇒ navigateur mort ⇒ 503). Sémaphore à compteur, FIFO.
 */
import { describe, expect, it } from "vitest";

import { createSemaphore, QueueFullError } from "../render/semaphore.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createSemaphore", () => {
  it("borne le nombre d'exécutions simultanées", async () => {
    const sem = createSemaphore(2);
    let inFlight = 0;
    let maxInFlight = 0;
    const gate = deferred();
    const started = deferred();
    const task = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Attente DÉTERMINISTE (revue T09) : signal quand la borne est atteinte,
      // jamais un setTimeout arbitraire.
      if (inFlight === 2) started.resolve();
      await gate.promise;
      inFlight -= 1;
      return "ok";
    };
    const all = Promise.all([
      sem.run(task),
      sem.run(task),
      sem.run(task),
      sem.run(task),
    ]);
    await started.promise;
    expect(maxInFlight).toBe(2);
    gate.resolve();
    expect(await all).toEqual(["ok", "ok", "ok", "ok"]);
    expect(maxInFlight).toBe(2);
  });

  it("FIFO : les tâches démarrent dans l'ordre d'arrivée (limite 1)", async () => {
    const sem = createSemaphore(1, 16);
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        sem.run(async () => {
          order.push(i);
        }),
      ),
    );
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("deux rafales SÉQUENTIELLES (limite 1) : le compteur retombe bien à zéro", async () => {
    const sem = createSemaphore(1);
    expect(
      await Promise.all([sem.run(async () => 1), sem.run(async () => 2)]),
    ).toEqual([1, 2]);
    expect(
      await Promise.all([sem.run(async () => 3), sem.run(async () => 4)]),
    ).toEqual([3, 4]);
  });

  it("exception SYNCHRONE dans la tâche : permis libéré quand même", async () => {
    const sem = createSemaphore(1);
    await expect(
      sem.run(() => {
        throw new Error("sync");
      }),
    ).rejects.toThrow("sync");
    await expect(sem.run(async () => "après")).resolves.toBe("après");
  });

  it("rejets MULTIPLES file pleine, avec des waiters en attente : la file sert ensuite normalement", async () => {
    const sem = createSemaphore(1, 1);
    const gate = deferred();
    const blocking = sem.run(async () => gate.promise);
    const queued = sem.run(async () => "servi");
    await expect(sem.run(async () => "r1")).rejects.toThrow(QueueFullError);
    await expect(sem.run(async () => "r2")).rejects.toThrow(QueueFullError);
    gate.resolve();
    await blocking;
    expect(await queued).toBe("servi");
  });

  it("une tâche qui REJETTE libère sa place (pas de fuite de permis)", async () => {
    const sem = createSemaphore(1);
    await expect(
      sem.run(async () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await expect(sem.run(async () => "après")).resolves.toBe("après");
  });

  it("refuse une limite invalide", () => {
    expect(() => createSemaphore(0)).toThrow();
    expect(() => createSemaphore(-1)).toThrow();
    expect(() => createSemaphore(2, -1)).toThrow();
  });

  it("FILE BORNÉE : au-delà, rejet IMMÉDIAT par QueueFullError — jamais une attente infinie", async () => {
    const sem = createSemaphore(1, 1);
    const gate = deferred();
    const blocking = sem.run(async () => gate.promise); // occupe le permis
    const queued = sem.run(async () => "en file"); // occupe LA place de file
    await expect(sem.run(async () => "refusé")).rejects.toThrow(QueueFullError);
    gate.resolve();
    await blocking;
    expect(await queued).toBe("en file");
    // La file s'est vidée : on accepte de nouveau.
    await expect(sem.run(async () => "après")).resolves.toBe("après");
  });
});
