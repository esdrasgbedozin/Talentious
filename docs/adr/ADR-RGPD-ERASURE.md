# ADR-RGPD-ERASURE — Suppression de compte (RGPD Art. 17, droit à l'effacement)

- **Statut** : Accepté (2026-07-11)
- **Décideur** : fondateur (point d'arrêt humain — décisions arbitrées avant implémentation)
- **Contexte technique** : `DELETE /users/me` (contrat OpenAPI `deleteAccount`), backend FastAPI + Postgres, frontend Next.js.

## Contexte

Le contrat (`contracts/openapi.yaml`) spécifie déjà l'endpoint `DELETE /users/me`
→ `204`/`401`, tag `Account`. Aucune route `/users/*` n'existait. Quatre entités
sont liées à `users` (`user_profiles`, `generated_cvs`, `cv_jobs`, `career_passes`),
toutes avec `ForeignKey(..., ondelete="CASCADE")` au niveau colonne. Le champ
`users.stripe_customer_id` existe mais n'est **jamais renseigné** (checkout Stripe
par `customer_email`, sans Customer persistant). Le stockage PDF en GCS
(`gcs_pdf_url`) est déclaré au modèle mais **non implémenté** (aucun client GCS).
Les JWT sont stateless, sans liste de révocation.

## Décisions

1. **Effacement dur en cascade.** Suppression via `DELETE FROM users WHERE id=…`
   (SQLAlchemy Core, pas `session.delete`) : la cascade Postgres purge les 4 tables
   liées, aucun orphelin. Le Core statement évite tout lazy-load des relationships
   sur le moteur async (qui lèverait `MissingGreenlet`). Pas de soft-delete : une
   demande d'effacement art. 17 doit réellement effacer.
2. **Stripe best-effort, non bloquant.** Si `stripe_customer_id` est présent, on
   supprime le Customer (`stripe.Customer.delete`, SDK synchrone → threadpool) ;
   tout échec est loggé et **n'interrompt pas** l'effacement. Aujourd'hui no-op
   (champ toujours nul) mais correct et testé. Stripe conserve les enregistrements
   de transactions pour ses obligations légales/fiscales — exception RGPD légitime.
3. **Pas de purge GCS** (infra inexistante). Point d'extension documenté dans le
   code : quand le stockage PDF GCS sera implémenté, l'effacement devra purger les
   blobs de l'utilisateur **avant** la suppression des lignes DB.
4. **Confirmation forte côté client, backend bearer-only.** Le backend se conforme
   au contrat : bearer JWT seul, sans corps de requête (le token donne déjà le
   contrôle total du compte). Le garde-fou contre l'effacement accidentel est
   côté front : bouton désactivé tant que l'utilisateur n'a pas re-saisi son email
   exact (récupéré via `/auth/me`, insensible à la casse).
5. **Invalidation JWT de facto.** Pas de blacklist (hors périmètre). Après
   effacement, `get_current_user` recharge l'utilisateur → `401` à la requête
   suivante. Le front détruit immédiatement la session locale (token, user, cookie
   `talentious_session`) et redirige vers `/`.
6. **Journal de conformité sans PII.** `logger.info` avec `user_id` (UUID
   pseudonyme) + timestamp du log, jamais email/nom — preuve de traitement de la
   demande sans reconstituer de donnée personnelle.

## Conséquences

- Conforme au contrat existant ; aucune migration de schéma (cascades déjà en place).
- **Irréversibilité assumée** : aucune récupération possible après confirmation.
  L'UX l'énonce explicitement (« définitive et immédiate »).
- Couvert par TDD (`backend/tests/test_account.py`) : cascade réelle vérifiée sur
  Postgres, auth requise, token invalidé après effacement, Stripe appelé seulement
  si customer présent, échec Stripe non bloquant.
- Vérifié e2e au navigateur sur un compte jetable : effacement DB confirmé
  (`users_count=0`, aucun orphelin), login post-suppression `401`.

## Limites / dettes suivies

- **Fenêtre JWT résiduelle** : un token émis avant l'effacement reste
  cryptographiquement valide jusqu'à `exp` (~30 min) pour toute route qui ne
  rechargerait pas l'utilisateur. Toutes les routes protégées passent aujourd'hui
  par `get_current_user` (rechargement → 401), donc pas d'exposition réelle. Une
  vraie révocation relève du chantier « session courte / refresh token ».
- **Purge GCS** à brancher lors de l'implémentation du stockage PDF (décision 3).
