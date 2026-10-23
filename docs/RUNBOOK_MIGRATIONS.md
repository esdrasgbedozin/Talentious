# Runbook — Migrations de base de données (prod)

> M1-T01 (F-07). Les commandes **[TOI]** manipulent des secrets ou touchent la
> prod : elles se lancent depuis ton terminal, jamais via l'assistant.

## La vérité sur les bases (à relire avant TOUT doute)

| Environnement | Instance / serveur | Base | Utilisateur |
|---|---|---|---|
| **Prod** | Cloud SQL `talentious-project:europe-west9:talentious-db-prod` | **`talentious`** | `talentious-app` |
| Local (compose) | conteneur `talentious_db` (port 5432) | `talentious` (+ `talentious_test`) | `talentious` |

Vérifié sur l'instance le 2026-10-22 (`gcloud sql databases list` → `postgres` +
`talentious` uniquement). **Ne jamais transposer un nom local vers la prod** :
le hotfix #40 avait pointé les migrations sur une base locale inexistante en
prod (`talentious_app`) et cassé le déploiement. Tout contrôle de base doit
IMPRIMER la base à laquelle il s'est réellement connecté.

## Chemin normal : automatique, dans le pipeline

1. **Sur PR** — job `migrations` (`ci-build.yml`) : cycle complet
   `upgrade head → downgrade base → upgrade head` sur un Postgres éphémère
   (`backend/scripts/check_migrations.py`). Une migration non réversible
   (downgrade manquant, incomplet, ou qui fuit tables/types ENUM) **met la CI
   de la PR en échec**. ⚠️ Le job n'est PAS encore un « required status
   check » sur `main` : le blocage dur du merge est un réglage GitHub à poser
   **[TOI]** (Settings → Branches → required checks ; attention, le workflow
   est filtré par `paths:` — une PR ne touchant pas `backend/**` laisserait un
   check requis en attente).
2. **Au push sur `main`** — job `migrate` (`deploy-prod.yml`) : Cloud SQL proxy
   (attente de disponibilité réelle + 1 retry sur transitoire), puis
   `alembic upgrade head` sur la base prod `talentious`, **avant** le rollout
   des services. Échec des migrations = déploiement bloqué (fail-safe).

Il n'y a donc RIEN à faire à la main dans le cas nominal.

## Écrire une migration (règles M1)

- `alembic revision` dans `backend/alembic/versions/`, nommage existant.
- **Additive, réversible, rétro-compatible V1** : le code N-1 doit tourner sur
  le schéma N (le rollout Cloud Run n'est pas atomique avec le migrate).
- `downgrade()` réel obligatoire — y compris le drop des types ENUM créés par
  `sa.Enum` (le `drop_table` ne les droppe pas ; bug réel corrigé dans la
  migration initiale `5d94399568e5`). Un downgrade avec perte de données
  assumée se documente dans la docstring de la migration.
- Valider en local avant la PR :
  `DATABASE_URL=postgresql+asyncpg://talentious:talentious@localhost:5432/migcheck_local python scripts/check_migrations.py`
  Le script exécute un `downgrade base` : il REFUSE tout hôte non local, toute
  URL à paramètres de requête, tout nom de base non explicitement jetable
  (doit contenir « migcheck » ou commencer par « jetable ») et toute base
  contenant des données. **Ne jamais le lancer pendant qu'un Cloud SQL proxy
  vers la prod tourne** : un proxy rend la prod joignable sur 127.0.0.1 — les
  gardes de nom et de contenu sont la dernière ligne de défense, pas une
  invitation à tester.
- **[PAH-M1]** : toute migration touchant des données existantes (backfill,
  transformation) attend une validation humaine explicite avant d'atteindre
  `main`.

## Vérifier l'état de la prod (lecture seule) [TOI]

Le secret `DATABASE_URL` est en forme « socket Cloud Run »
(`…@/talentious?host=/cloudsql/…`) : il faut retirer la requête et insérer
l'hôte du proxy. `CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT=''` neutralise,
pour cette commande seulement, l'impersonation lecture-seule posée dans la
config gcloud globale (SA du MCP, qui n'a pas accès aux secrets). Le secret ne
transite que par la mémoire du process — jamais affiché, jamais dans
l'historique (seul le texte littéral de la commande y entre).

La procédure entière tient dans un SOUS-SHELL `( … )` : le `trap EXIT` y coupe
le proxy dès la fin du bloc — sans sous-shell, la prod resterait joignable sur
127.0.0.1:5433 tant que le terminal vit.

```bash
(
set -e
cloud-sql-proxy --port 5433 talentious-project:europe-west9:talentious-db-prod &
trap 'kill %1' EXIT
for i in $(seq 1 15); do (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null && break; sleep 1; done
DATABASE_URL="$(CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT='' gcloud secrets versions access latest --secret=DATABASE_URL)" python3 - <<'EOF'
import os, psycopg2
raw = os.environ.pop("DATABASE_URL").strip().split("?", 1)[0]
scheme_rest = raw.split("://", 1)[1]
netloc, _, dbname = scheme_rest.partition("/")
creds = netloc.rpartition("@")[0]  # DERNIER '@' : mdp à caractères spéciaux ok
conn = psycopg2.connect(f"postgresql://{creds}@127.0.0.1:5433/{dbname}")
cur = conn.cursor()
cur.execute("SELECT current_database()")
print("base connectée :", cur.fetchone()[0])  # DET-CI-DBPROD : toujours l'imprimer
cur.execute("SELECT version_num FROM alembic_version")
print("révision :", cur.fetchone()[0])
conn.close()
EOF
)
```

Attendu : la révision = `alembic heads` du commit déployé.

## Application manuelle (secours uniquement) [TOI]

Uniquement si le job `migrate` est en échec persistant ET que le correctif ne
peut pas passer par un push sur `main`. ⚠️ Procédure jamais encore déroulée en
réel : la tester une fois À FROID (reste M1) avant d'en avoir besoin en
incident.

```bash
(
set -e
cloud-sql-proxy --port 5433 talentious-project:europe-west9:talentious-db-prod &
trap 'kill %1' EXIT   # sous-shell : le proxy meurt à la fin du bloc, succès ou échec
for i in $(seq 1 15); do (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null && break; sleep 1; done
# Même transformation d'URL que ci-dessus (requête retirée, hôte du proxy).
DATABASE_URL="$(CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT='' gcloud secrets versions access latest --secret=DATABASE_URL \
  | python3 -c "import sys; u=sys.stdin.read().strip().split('?',1)[0]; s,r=u.split('://',1); n,_,d=r.partition('/'); print(f'{s}://{n.rpartition(chr(64))[0]}@127.0.0.1:5433/{d}')")" \
  bash -c 'cd backend && alembic upgrade head'
)
```

## Rollback

- **Schéma seul, migration réversible** : `alembic downgrade -1` via la même
  procédure manuelle — après avoir vérifié la docstring du `downgrade()`
  (perte de données ?).
- **Perte de données possible** : ne PAS downgrader — restaurer depuis les
  sauvegardes automatiques Cloud SQL (PITR), puis redéployer l'image N-1.
- Dans les deux cas : point d'arrêt humain AVANT d'agir.

## Migrations notables

- `c8d9e0f1a2b3` (M1-T03) : bascule DÉFINITIVEMENT les `template_id` legacy
  (`modern_v1`…) vers `modern_sobre` — réversible en schéma, pas en valeurs
  (le rendu ne change pas : même alias que le registre front). Les valeurs
  réécrites sont tracées dans la sortie du job `migrate`.

## Incidents connus

| Date | Symptôme | Cause | Parade en place |
|---|---|---|---|
| 2026-10-22 (#39) | `server closed the connection unexpectedly` au migrate | proxy lancé mais pas prêt (`sleep 5`) | attente de disponibilité + 1 retry |
| 2026-10-22 (#40/#41) | `database "talentious_app" does not exist` | nom de base LOCAL transposé en prod | tableau de vérité ci-dessus ; les contrôles impriment la base connectée |
