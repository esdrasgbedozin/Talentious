# ADR-JOBS — Jobs généralisés : `job_type`, unicité par (user, type), async in-process avec déclencheur de sortie

- **Statut** : Accepté (2026-10-23)
- **Décideur** : fondateur (roadmap V2, M1-T06 ; archi V2 §7 ADR n°8, « Tension n°1 »)
- **Contexte technique** : backend FastAPI mono-instance Cloud Run
  (`max_instances=1`), jobs asynchrones `cv_jobs` (BackgroundTasks in-process,
  M1 V1), contrat `JobType` (`contracts/openapi.yaml`), export-service dédié à
  venir (M2, ADR-PDF-RENDER).

## Contexte

La V1 n'a qu'un traitement asynchrone (la génération de CV) : une table
`cv_jobs`, un worker in-process (`BackgroundTasks`), et un index partiel
unique « un job actif par user » comme garde d'idempotence. La V2 ajoute la
lettre de motivation, l'export PDF/docx et la relecture IA — tous asynchrones,
tous sur le même cycle de vie (`queued → running → succeeded | failed`).

Deux tensions :

1. **L'unicité V1 est trop large.** « Un job actif par user » interdirait de
   lancer une génération de CV pendant qu'un export tourne — contraire au
   contrat, qui impose l'unicité **par couple (utilisateur, `job_type`)**
   (409 sur doublon du même type uniquement).
2. **Tout présuppose une instance unique** (archi V2, « Tension n°1 ») : le
   rate-limit est in-memory et les workers tournent dans le process de l'API.
   La V2 ajoute de l'orchestration sur cette même instance.

## Décisions

1. **Une seule table de jobs, discriminée par `job_type`.** `cv_jobs` porte
   `job_type` (ENUM Postgres `jobtype`, valeurs du contrat :
   `cv_generation`, `letter_generation`, `export`, `review`). Le stock V1 est
   backfillé `cv_generation` par `server_default` (metadata-only — doctrine
   M1-T05) ; le défaut reste en place pour la rétro-compat rollout, retrait au
   ticket de contraction post-M1-T13.

2. **L'unicité d'un job actif s'applique par (user, `job_type`)**, gardée par
   la BASE : index partiel unique `uq_cv_jobs_one_active_per_user_type`
   (`user_id, job_type` WHERE statut actif), migration `f1a2b3c4d5e6`. Le
   pre-check des routes n'est qu'un fast path pour un 409 propre ; l'index est
   la vraie protection contre la course entre deux lancements concurrents.
   Chaque endpoint de lancement filtre et écrit SON type explicitement, et son
   catch du 409 filtre sur le NOM de la contrainte (`_is_active_job_conflict`)
   — toute autre `IntegrityError` remonte comme l'erreur serveur qu'elle est.
   À factoriser en helper partagé à l'arrivée des routes lettre/export/
   relecture (M2-T16, M6-T10, M7-T04).

3. **L'async in-process est conservé pour la V2 bêta.** `BackgroundTasks` +
   `max_instances=1` : le gros du calcul (rendu PDF/docx) étant déporté sur
   l'export-service, l'instance API reste légère. Ce n'est PAS de la dette
   cachée : la frontière et son chemin de sortie sont écrits ci-dessous.

4. **Déclencheur de sortie (le cœur de cet ADR).** AVANT l'un ou l'autre de
   ces événements, la migration ci-dessous est OBLIGATOIRE — pas « après si ça
   casse » :
   - passage à `max_instances > 1` (charge, disponibilité), OU
   - besoin de **durabilité** des jobs (un job perdu au redémarrage de
     l'instance devient inacceptable — ex. jobs payés).

   La migration, les DEUX ensemble (l'un sans l'autre casse) :
   - **Cloud Tasks** : file durable, push OIDC vers des endpoints worker
     privés (le job survit au redémarrage, retries gérés par la file) ;
   - **Memorystore (Redis)** : remplace le rate-limit in-memory par un store
     partagé entre instances (sinon chaque instance a son propre compteur).

   L'unicité par (user, type) reste gardée par l'index Postgres — elle est
   déjà multi-instance par construction.

## Conséquences

- **R2 soldé, le contrat gagne** : les noms de `job_type` sont ceux du contrat
  (`export` — pas `pdf_render`/`docx_export` qu'évoquait l'archi §4 ; archi
  mise à jour à ce ticket). Un seul type `export` : PDF vs docx est un
  PARAMÈTRE du job, pas un type.
- Les workers V2 (M2-T16 export, M6-T10 lettre, M7-T04 relecture) créent des
  jobs de LEUR type ; le 409 d'un type ne bloque jamais les autres.
- **Limite assumée (bêta)** : un job actif orphelin (instance redémarrée
  pendant un run) garde le slot de son (user, type) occupé jusqu'à résolution
  manuelle — c'était déjà vrai en V1 pour la génération. C'est le premier
  symptôme qui doit déclencher la migration Cloud Tasks (durabilité).
- Le downgrade de `f1a2b3c4d5e6` échoue volontairement si un utilisateur a
  plusieurs jobs actifs de types différents (l'ancien index « un actif par
  user » serait violé) : résoudre ces jobs d'abord — jamais de suppression
  silencieuse.

## Alternatives écartées

- **Cloud Tasks + Memorystore dès la V2** : coût fixe et complexité
  (endpoints push, OIDC, IAM, Redis) injustifiés en bêta mono-instance — le
  déclencheur écrit transforme ce report en décision, pas en dette.
- **`BackgroundTasks` sans issue écrite** : la V1 l'a fait ; sans déclencheur,
  le passage à l'échelle se découvre en incident (rate-limit par instance,
  jobs perdus).
- **Monter `max_instances` sans store partagé** : rate-limit contournable en
  répartissant les requêtes, workers dupliqués.
- **Une table de jobs par capacité** (`export_jobs`, `letter_jobs`…) :
  quadruple le polling (`GET /jobs/{id}` unifié au contrat), duplique le cycle
  de vie, et l'unicité croisée deviendrait inexprimable en un index.
