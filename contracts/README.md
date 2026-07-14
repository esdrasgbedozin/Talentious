# contracts/ — Contrats d'interface Talentious V1

Ce dossier est la **source de vérité technique** pour toutes les interfaces de la plateforme.
Le code (types Pydantic, interfaces TypeScript) est **généré depuis ces contrats**, jamais l'inverse.

## Structure

```
contracts/
├── openapi.yaml                        # API backend V1 complète (source canonique)
├── agents/
│   ├── analyseur-offre.openapi.yaml    # Agent d'analyse d'offres
│   ├── redacteur-cv.openapi.yaml       # Agent de génération de CV
│   └── parser-pdf.openapi.yaml        # Agent d'extraction PDF
└── README.md                           # Ce fichier
```

## Règle d'or

> Toute évolution d'interface met à jour le contrat **avant** le code,
> puis régénère les types. Ne jamais modifier Pydantic ou TypeScript
> directement si le changement touche une interface publique ou inter-services.

---

## Stratégie de génération de types

### Backend Python (Pydantic)

```bash
# Depuis la racine du monorepo
npx @openapitools/openapi-generator-cli generate \
  -i contracts/openapi.yaml \
  -g python-pydantic-v1 \
  -o backend/app/generated/ \
  --additional-properties=packageName=talentious_schemas
```

Les modèles générés remplacent `backend/app/schemas/profile.py` (sauf les schémas
non liés au profil, comme `UserCreate`, déjà définis dans `schemas/user.py`).

Les agents importent leurs modèles depuis leur propre contrat (généré séparément) :

```bash
# Agent rédacteur-cv
npx @openapitools/openapi-generator-cli generate \
  -i contracts/agents/redacteur-cv.openapi.yaml \
  -g python-pydantic-v1 \
  -o agents/redacteur-cv/app/generated/
```

### Frontend TypeScript

```bash
# Depuis la racine du monorepo
npx @openapitools/openapi-generator-cli generate \
  -i contracts/openapi.yaml \
  -g typescript-axios \
  -o frontend/src/generated/ \
  --additional-properties=supportsES6=true,withSeparateModelsAndApi=true
```

Les types générés remplacent `frontend/src/types/profile.ts`.
Le client Axios généré remplace les appels manuels dans `frontend/src/lib/api.ts`.

### Automatisation CI

Un step de CI vérifie que les types commités sont bien en sync avec les contrats :

```yaml
- name: Check generated types are up to date
  run: |
    npx @openapitools/openapi-generator-cli generate ...
    git diff --exit-code backend/app/generated/ frontend/src/generated/
```

---

## Mapping des renommages (champs unifiés)

Ces renommages résolvent les divergences identifiées dans l'audit (§4.2).
Le code legacy qui utilise les anciens noms doit être migré vers les nouveaux.

| Ancienne clé | Nouvelle clé canonique | Où c'était | Impact |
|---|---|---|---|
| `issuing_organization` | `issuer` | Frontend TS, backend Pydantic | L'agent rédacteur utilisait déjà `issuer` — c'est ce nom qui est retenu. Migration frontend+backend requise. |
| `field_of_study` | `field` | Frontend TS, backend Pydantic | L'agent utilisait déjà `field`. Renommage côté frontend et Pydantic. |
| `graduation_date` | `end_date` (optionnel) | Sortie agent `SelectedEducation` | Était `str` requis — devient `string \| null` optionnel. Élimine les 422 aléatoires. |
| `issue_date` (requis) | `issue_date` (optionnel) | Sortie agent `SelectedCertification` | Était `str` requis — devient `string \| null` optionnel. Élimine les 422 aléatoires. |

### Champs rétablis (étaient perdus dans le pipeline)

Ces champs existaient côté frontend/backend mais n'étaient pas transmis aux agents.
Ils sont désormais inclus dans le contrat canonique et dans les contrats agents.

| Champ | Était absent de | Impact rétabli |
|---|---|---|
| `languages` | Backend `ProfileData`, frontend `UserProfile` | Les langues sont désormais transmises à l'agent rédacteur |
| `experiences[].achievements` | Agent rédacteur (entrée) | Les réalisations concrètes sont transmises pour enrichir le CV |
| `experiences[].is_current` | Agent rédacteur (entrée) | L'agent sait si un poste est actuel |
| `educations[].field` | Agent rédacteur (non remappé) | Le domaine d'étude n'est plus perdu |
| `certifications[].expiration_date` | Agent rédacteur | L'expiration est transmise |
| `certifications[].credential_url` | Agent rédacteur | L'URL de vérification est transmise |
| `projects[].role` | Agent rédacteur | Le rôle dans le projet est transmis |

---

## Décision sur `skills` — Structure canonique unique

**Décision actée** : la structure `{hard: string[], soft: string[]}` est conservée comme
format canonique unique, côté utilisateur (frontend/backend) **et** côté agents.

**Pourquoi** : la transformation runtime dans `cv.py` (`hard_skill` → `{name, level: "advanced",
category: "hard_skill"}`) était la principale source de fragilité (ADR-R4, MIN-8 de l'audit).
Les niveaux étaient devinés (hard = "advanced", soft = "intermediate") sans fondement dans
les données utilisateur. L'agent rédacteur infère les niveaux du contexte global du profil
et de l'offre — c'est son rôle, pas celui d'une transformation hardcodée.

**Conséquence** : supprimer le bloc `cv.py:169-195` (transformation runtime). L'agent reçoit
`{hard: [...], soft: [...]}` directement. Les niveaux apparaissent uniquement en **sortie**
(`HighlightedSkill.level`, inféré par l'IA).

---

## Génération asynchrone — États du job

```
POST /v1/cv/generate
        │
        └─► 202 Accepted { job_id, status: "queued" }
                │
                ▼
           [worker pick up]
                │
                ▼
           status: "running" (progress_pct: 0..100)
           ├─► GET /v1/cv/jobs/{job_id}  (polling)
           └─► GET /v1/cv/jobs/{job_id}/events  (SSE optionnel)
                │
        ┌───────┴────────┐
        ▼                ▼
  status: "succeeded"  status: "failed"
  cv_id renseigné      error_message générique
        │
        ▼
  GET /v1/cv/{cv_id}
```

---

## Politique CareerPass et rôle admin

- Tout endpoint de génération vérifie `career_passes.valid_until > now()`.
- Le rôle `ADMIN` bypasse ce contrôle (documenté dans `openapi.yaml`).
- En l'absence de pass actif pour un `USER`, la réponse est `402 application/problem+json`.
- `stripe_payment_id` est **nullable** : les CareerPass créés hors Stripe (admin, seed)
  n'ont pas de `stripe_payment_id`. La contrainte `nullable=False, unique=True` du modèle
  actuel doit être migrée vers `nullable=True`.

---

## Politique d'erreurs RFC 7807

Toutes les réponses d'erreur utilisent `Content-Type: application/problem+json`.
Le schéma `Problem` est défini dans chaque fichier de contrat.

Règles de sécurité :
- Jamais de `str(e)` ni de stack trace dans le champ `detail`.
- Le champ `detail` est un message lisible par un humain, sans information interne.
- Les détails techniques sont loggués côté serveur avec un `trace_id` (à implémenter).

---

## Accès aux agents (IAM)

Les trois agents sont **privés** (`--no-allow-unauthenticated` sur Cloud Run).
Seul le compte de service backend (`backend-sa@<project>.iam.gserviceaccount.com`)
dispose du rôle `roles/run.invoker` sur chaque agent.

Le backend obtient un token IAM via `google.auth` et le transmet en `Authorization: Bearer`.
Les clients agents (`analyzer_client.py`, `writer_client.py`, `parser_client.py`) doivent
tous utiliser ce mécanisme — `parser_client.py` l'implémente déjà correctement.

---

## Note sur le parser-pdf

Le service `parser-pdf` est documenté comme microservice dans ce contrat, mais l'audit
recommande de le **rebrancher comme fonction backend** (import de PyMuPDF directement dans
`backend/app/services/parser_service.py`) plutôt que de le maintenir comme 3e microservice.

Cette décision est à trancher avant l'implémentation. Si la voie microservice est retenue,
le contrat `agents/parser-pdf.openapi.yaml` est la référence. Si la voie fonction est retenue,
ce fichier documente l'interface interne et le microservice peut être supprimé.
