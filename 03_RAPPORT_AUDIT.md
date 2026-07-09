# 03 — RAPPORT D'AUDIT (contre-expertise) « TALENTIOUS »

> **Statut** : contre-expertise croisée du 2026-07-08, en LECTURE SEULE.
> **Council Audit** : quality-auditor (cohérence docs/code), red-team-adversary (sécurité/robustesse),
> principles-guardian (fidélité aux 6 piliers). Synthèse et vérifications complémentaires par la session lead.
> **Cibles** : documents reconstruits (`00_BIBLE_PROJET.md`, `01_ARCHITECTURE_TECHNIQUE.md`, `ONBOARDING.md`)
> + code réel cloné dans `/tmp/talentious-onboard` (branches `main`, `develop`, `feature/dashboard-and-editor`).
> **Aucun correctif appliqué.** Ce document constate et recommande ; les corrections sont décidées par l'humain.

---

## 0. Verdict global

**L'architecture existante est VALIDÉE dans ses fondations, mais INVALIDÉE dans sa réalisation actuelle.**
Recommandation unanime du council : **VOIE MÉDIANE** — conserver le code sain, refonder les contrats et la
documentation, jeter ce qui viole structurellement les piliers. **Ni repartir de zéro, ni restaurer tel quel.**

Les documents reconstruits par l'onboarding sont **fiables comme base de travail** (100 % des affirmations
lourdes de conséquences vérifiées exactes), sous réserve de deux corrections de prémisses établies par cet audit
(§1) et d'un élargissement de l'inventaire des contrats (§4.2).

### Correction majeure de prémisses (établie par l'audit, invalide deux constats de l'onboarding)

L'onboarding n'a analysé que la branche `main`. La contre-expertise a inspecté **toutes** les branches distantes :

- ❌ **« La branche `develop` a été supprimée → CI morte »** est **FAUX**. `develop` existe toujours sur origin
  (`git ls-remote` : `refs/heads/develop`), à 0 commit d'avance et 1 commit de retard sur `main`. La CI staging
  n'est donc **pas** morte pour cette raison. (Il reste vrai qu'il n'y a aucun pipeline de **production** et aucun
  lint/scan sécurité en CI.)
- ❌ **« Aucune UI de génération, pas de page `/dashboard` »** est **FAUX sur la branche `feature/dashboard-and-editor`**
  (9 commits non mergés, nov. 2025, jamais intégrés à `main`). Cette branche contient précisément le travail réputé
  perdu : `frontend/src/app/dashboard/page.tsx` (259 l.), `frontend/src/components/GenerateCVModal.tsx` (337 l.),
  un système `Toast`/`ConfirmDialog`, une lib API, **et un contournement du bug `timezone`** (remplacement de
  `datetime.now(timezone.utc)` par `datetime.utcnow()` dans `cv.py`).

**Conséquence** : le « dossier local vide » et le travail « perdu » évoqués correspondent très probablement à cette
branche `feature/dashboard-and-editor` non mergée. **Action prioritaire avant toute décision : décider du sort de
cette branche** (l'auditer, la rebaser, en récupérer l'UI). ⚠️ Son correctif `timezone` est un *contournement* qui
réintroduit une datetime naïve (dette Mi2), pas la correction propre ; et elle **ne corrige ni les contrats
divergents, ni les schémas sur-contraints, ni le problème CareerPass** — les bugs #2/#3/#4 y subsistent.

---

## 1. Constats BLOQUANTS (interdisent toute mise en production ; à traiter avant tout nouveau code de fond)

**BLK-1 — Aucun client réel ne peut générer de CV (produit non fonctionnel de bout en bout).**
`CareerPass.stripe_payment_id` est `nullable=False, unique=True` (`models/career_pass.py:41`) et **aucun code du
dépôt ne crée jamais de CareerPass** (pas de route Stripe, pas de seed). Tout non-admin bute donc sur le contrôle
402 (`cv.py:98-104`). Même en corrigeant tous les autres bugs, seul un `UPDATE` SQL manuel du rôle permet de
générer un CV. → *Débloquer par une intégration Stripe OU un mécanisme admin/seed propre, décidé en amont.*

**BLK-2 — `NameError: timezone` casse la génération pour tout non-admin (sur `main`).**
`cv.py:7` importe `datetime` seul ; `cv.py:101` appelle `datetime.now(timezone.utc)` → 500 systématique sur le
chemin payant (l'admin passe avant, `cv.py:93-95`, ce qui a masqué le bug). Aucun test ne couvre ce module.
→ *Corriger par `from datetime import datetime, timezone` (pas par `utcnow()` naïf), test rouge d'abord.*

**BLK-3 — Contrats de données divergents non formalisés = cause racine récurrente.**
Aucun `openapi.yaml`. Contrats implicites divergents entre frontend/backend/agents (détail §4). Symptômes directs :
certifications `issuing_organization` (backend, `schemas/profile.py:73`) vs `issuer` requis (agent,
`redacteur-cv/models.py:92`) → 422 ; sorties `graduation_date`/`issue_date` en `str` **requis** (`models.py:160,186`)
alors que les entrées sont optionnelles → 422 aléatoire. Chaque évolution recassera la génération.
→ *Chantier Contract First fondateur (OpenAPI unique + schémas partagés générés) AVANT tout hotfix de fond.*

**BLK-4 — Agents IA déployés PUBLICS + coûts Vertex non plafonnés.**
Les 3 agents sont déployés `--allow-unauthenticated` (`agents-staging.yml:61,120,179`) : `POST /analyze` et
`POST /generate` sont appelables par n'importe qui, jusqu'à 3 appels Gemini chacun (retry, `vertex_ai_service.py:66`),
8192 tokens, 200 000 caractères d'entrée (`analyseur-offre/app/models.py:16`). Aucun quota par utilisateur, aucun
rate limiting, aucun budget GCP. Facture ouverte à l'abus. → *Agents en `--no-allow-unauthenticated` (invoker = SA
backend seul), quota/rate limiting, budget + plafond GCP.*

**BLK-5 — Injection de prompt avec exfiltration possible du profil.**
Le texte d'offre est injecté brut via `prompt_template.format(...)` (`analyseur-offre/.../vertex_ai_service.py:88`),
sans délimiteur ni neutralisation, puis réinjecté avec **le profil complet** (nom, email, tél, adresse, parcours)
dans le rédacteur (`redacteur-cv/.../vertex_ai_service.py:164-175`). Une offre malveillante peut détourner la sortie
ou exfiltrer des données personnelles, notamment via le champ libre `optimization_notes` (`prompts/redacteur.txt:140`).
→ *Délimiteurs stricts « donnée, jamais instruction », suppression/filtrage d'`optimization_notes`, validation stricte
de la sortie contre schéma.*

**BLK-6 — Cœur métier sans aucun test (viole le pilier 4).**
0 test sur `routes/cv.py` (le module le plus critique et le plus bogué), 0 test unitaire sur les 3 agents.
C'est ce qui a laissé BLK-2 atteindre `main`. → *Test rouge sur `POST /cv/generate` (agents mockés) avant tout fix.*

---

## 2. Constats MAJEURS (à corriger avant la V1, non bloquants pour un environnement de test contrôlé)

**MAJ-1 — Génération synchrone HTTP 2-5 min, incompatible Cloud Run/UX.**
`generate_cv` (`cv.py:121-246`) est séquentiel synchrone ; timeout httpx writer 600 s (`writer_client.py:16`) +
analyzer 120 s. Mais le backend est déployé **sans `--timeout`** (`backend-staging.yml:142-154`) → défaut Cloud Run
300 s : la requête est coupée avant la fin, pendant que Gemini continue (et facture). → *Passer en job asynchrone
(queue + polling/SSE), acté en ADR. Aligner les timeouts entre-temps.*

**MAJ-2 — Requêtes non idempotentes = double facturation.**
Pas d'idempotency key, ni verrou, ni queue (`cv.py:121-246`). Un double-clic ou un retry lance 2 pipelines complets
(jusqu'à 12 appels Gemini) et crée 2 `GeneratedCV`. → *Idempotency key + verrou (une génération active par user).*

**MAJ-3 — RGPD non tenu malgré le confinement `europe-west9`.**
PII carrière en clair (JSONB/Text non chiffrés, `models/user_profile.py`, `models/generated_cv.py:39-40`) ; bucket GCS
**versionné** (`infra/main.tf:76-78`) → PDF supprimés récupérables indéfiniment ; **aucune route de suppression de
compte** (droit à l'effacement, art. 17) ; email et prompts loggables en `debug=True` par défaut (`config.py:16`,
`redacteur-cv/app/main.py:117`). La localisation ≠ conformité. → *Endpoint suppression compte (purge User+profil+CV+GCS),
lifecycle bucket, `debug=False` par défaut, masquage PII dans les logs, chiffrement des champs sensibles.*

**MAJ-4 — Fuite d'internals au client (viole RFC 7807 imposé par CLAUDE.md).**
`cv.py:245` renvoie `str(e)` ; `writer_client.py:61,67,95` renvoient le `response.text` interne ; idem
`redacteur-cv/app/main.py:161`, `parser-pdf/app/main.py:137,148`. Aucune erreur au format `application/problem+json`.
→ *Message générique côté client, détail loggé serveur seulement.*

**MAJ-5 — Auth vulnérable au brute-force et à l'énumération d'emails.**
`/auth/login` sans rate limiting (`auth.py:94`) ; `/auth/register` révèle « Email already registered » (`auth.py:44-48`) ;
timing bcrypt divergent si l'utilisateur n'existe pas (pas de `verify_password`, `auth.py:113`) → énumération par timing.
→ *Rate limiting/lockout, message d'inscription générique, `verify_password` factice si user absent.*

**MAJ-6 — Moindre privilège violé : SA Compute par défaut (Editor projet) partout.**
`create-secrets.sh:102` accorde l'accès aux secrets au SA Compute par défaut (rôle Editor projet) ; les agents sont
déployés sans `--service-account`. Chaque agent IA public (BLK-4) tourne donc avec Editor projet. → *SA dédiés par
service, rôles minimaux ciblés.*

**MAJ-7 — Infra destructible sans garde-fou.**
`deletion_protection = false` sur Cloud SQL (`infra/main.tf:40`) et `force_destroy = true` sur le bucket de CV
(`infra/main.tf:72-73`). Un `terraform destroy` ou un remplacement détruit la base et tous les CV. Combiné à MAJ-6
= risque de perte totale. → *`deletion_protection = true`, `force_destroy = false`, PITR/backups vérifiés.*

**MAJ-8 — Dérive IaC : la moitié de l'infra vit dans des scripts CI.**
Terraform ne gère ni Cloud Run, ni IAM, ni Secret Manager, ni le réseau (créés par `gcloud run deploy` dans les
workflows, `backend-staging.yml:140-154`). Aucun pipeline de **production**, aucun lint/scan sécurité en CI.
→ *Rapatrier Cloud Run/IAM/Secrets dans Terraform ; ajouter un pipeline prod + lint + scan sécu.*

**MAJ-9 — Contrats divergents SOUS-ESTIMÉS par les documents (pertes de données silencieuses).**
Au-delà de skills et certifications, au moins 6 autres champs divergent ou sont perdus (détail §4.2) : `languages`
(présent seulement côté agent → jamais transmis), `field_of_study`→`field` (non remappé → domaine d'étude perdu),
`expiration_date`/`credential_url`/`Project.role`/`Experience.achievements` (absents côté agent). → *Cartographier
TOUS les champs avant le travail Contract First ; le hotfix « certifications seul » est insuffisant.*

**MAJ-10 — Documents historiques (`ROADMAP.md`) contradictoires et non fiables comme indicateur.**
La ROADMAP se contredit sur l'état du Rédacteur-CV (§3.3 « non fait » vs §3.5 « COMPLETED ») ; prévoit un champ
`users.pass_expires_at` (§5.1) alors que le code implémente une table `career_passes` — toute impl. Stripe suivant la
roadmap écrirait dans un champ inexistant ; décrit dès le départ les schémas des agents comme contrat, semant la
divergence. → *Ne pas réutiliser la ROADMAP historique comme source ; la remplacer par `04_ROADMAP.md`.*

**MAJ-11 — Trous documentaires structurants** (à combler dans l'architecture cible) :
observabilité (logs JSON, trace ID, métriques succès/échec du pipeline IA, SLO — absents) ; sauvegarde/restauration DB
(backup activé `main.tf:47-50` mais ni RPO/RTO, ni rétention, ni PITR, ni restauration testée) ; stratégie d'erreurs
RFC 7807 ; versioning d'API (`/v1`) ; matrice d'environnements dev/staging/prod ; quotas/coûts Vertex par génération.

---

## 3. Constats MINEURS (dette à résorber, non bloquants)

- **MIN-1** — 2 des 3 agents (`analyseur-offre`, `redacteur-cv`) partagent ~70 % de structure (`vertex_ai_service.py`,
  `prompt_loader.py`) mais divergent fonctionnellement (l'analyseur appelle `generate_content` synchrone dans une
  méthode `async`, `analyseur-offre/.../vertex_ai_service.py:60,108` → bloque l'event loop ; le rédacteur utilise
  `asyncio.to_thread`). La factorisation devra **réconcilier** les comportements, pas seulement dédupliquer.
  *(Correction d'une imprécision de `01_ARCHITECTURE:82` : « 90 % dupliqués » est surestimé, et `parser-pdf` n'a ni
  `models.py` ni `services/` — la duplication ne concerne que 2 agents.)*
- **MIN-2** — Service `parser-pdf` complet mais **jamais branché** (`parser_client.py:204` jamais importé,
  `cv.py:19-20` n'importe qu'analyzer + writer) ; l'upload frontend est simulé (`onboarding/page.tsx:74-80`,
  `// TODO: Phase 3` + `setTimeout`). → *Si l'import PDF est V1, le rebrancher comme fonction backend, pas comme 3e
  microservice ; sinon supprimer.*
- **MIN-3** — `datetime.utcnow()` naïf/déprécié partout (`profile.py:102`, `cv.py:363`, modèles) → comparaisons
  naïf vs aware fragiles. Le contournement de la branche `feature/*` aggrave cette dette au lieu de la résorber.
- **MIN-4** — Logs non structurés (texte + emojis, pas de JSON, pas de corrélation) — viole la convention permanente.
- **MIN-5** — CORS agents `allow_origins=["*"]` **avec** `allow_credentials=True` (`analyseur-offre/app/main.py:51-54`,
  `redacteur-cv/app/main.py:69-73`) : combinaison invalide et dangereuse. CORS backend limité à localhost (`config.py:30`).
- **MIN-6** — Migration `jsonb_agg` → `null` au lieu de `[]` sur tableau vide (`0a59b3039eea:42-46`, pas de COALESCE).
- **MIN-7** — Validation d'entrée incomplète : `offer_text` sans `max_length` côté backend (`cv.py:43`, borné seulement
  à l'agent → échec tardif) ; « max 20 skills » documenté mais non contraint (`schemas/profile.py:53-54`) ; URLs non validées.
- **MIN-8** — Écart d'audit silencieux : le rapport de bug de nov. 2025 recommandait d'aligner les agents (« Option A »)
  mais c'est la transformation runtime (« Option C, DÉCONSEILLÉE », `BUG_SKILLS_STRUCTURE_CONFLICT.md:222`) qui fut
  implémentée (`cv.py:169-195`), sans ADR justifiant l'écart, et déclarée « ✅ RÉSOLU » alors qu'elle ne traite que
  les skills. → *Requalifier « partiellement résolu, dette ouverte » ; produire l'ADR, ou (préférable) dissoudre la
  transformation dans le contrat unifié.*
- **MIN-9** — Health-check writer défini mais jamais appelé (`writer_client.py:98`) → pas de vérification de santé
  avant le pipeline (échec tardif après avoir déjà payé l'analyseur) ; pas de circuit breaker.
- **MIN-10** — Bugs de documentation reconstruite à corriger : la Bible réintroduit le terme « MVP », banni par le
  pilier 1 (`00_BIBLE_PROJET.md:39,51` → reformuler « périmètre V1 réduit ») ; l'architecture nomme le secret
  `SECRET_KEY` alors que le nom réel déployé est `JWT_SECRET_KEY` (`backend-staging.yml:149`) ; l'architecture omet
  `force_destroy = true` (MAJ-7) ; la Bible présente le pipeline « cassé » sans la nuance admin/non-admin de BLK-2.

---

## 4. Analyse Contract First (cause racine n°1)

### 4.1 État
Aucun contrat formalisé. 4 jeux de modèles concurrents : frontend TS, backend Pydantic, entrée agents, sortie agents.
Un `verify_contracts.sh` (curl manuel) tient lieu de test de contrat, non exécuté en CI. C'est la violation
structurelle la plus coûteuse : elle est la cause directe de 3 des 4 bugs de génération de CV.

### 4.2 Cartographie complète des divergences (à traiter en une passe)

| Champ | Frontend/Backend | Agent (entrée/sortie) | Impact |
|---|---|---|---|
| **skills** | `{hard[], soft[]}` | `[{name, level, category}]` | Remappé à la volée (`cv.py:169-195`), niveaux devinés — fragile |
| **certifications.issuer** | `issuing_organization` (requis) | `issuer` (requis) | 422 sur tout profil avec certif |
| **certifications.issue_date** | `issue_date` optionnel | sortie `str` **requis** | 422 aléatoire |
| **educations.graduation_date** | `start_date` optionnel | sortie `str` **requis** | 422 aléatoire |
| **educations.field** | `field_of_study` | `field` (non remappé) | Domaine d'étude **perdu** |
| **languages** | absent | présent seulement côté agent | Langues **jamais transmises** |
| **certifications.expiration_date / credential_url** | présents | absents côté agent | **Perdus** |
| **projects.role** | présent | absent côté agent | **Perdu** |
| **experiences.achievements / is_current** | présents | absents côté agent | **Non transmis** |

→ Le hotfix « corriger le mapping certifications » est **nécessaire mais insuffisant** : il faut un contrat unique
couvrant TOUS ces champs, générant les types des deux côtés, avec test de contrat en CI.

---

## 5. Fidélité aux 6 piliers (synthèse principles-guardian)

| Pilier | Verdict | Preuve principale |
|---|---|---|
| 1. V1 de Production | **VIOLÉ** (code) / à corriger (docs) | Dette « Option C déconseillée » implémentée sans résorption ; secret par défaut ; « MVP » dans la Bible |
| 2. Agnosticisme architectural | **PARTIELLEMENT VIOLÉ** | 3 microservices (dont un mort) pour un dev solo ; génération synchrone 2-5 min plaquée |
| 3. Contract First | **VIOLÉ STRUCTURELLEMENT** | Aucun OpenAPI, 4 contrats divergents (§4) |
| 4. TDD & BDD | **VIOLÉ SUR LE CŒUR** | 0 test sur `cv.py` et les agents → NameError en prod |
| 5. Audit systématique | **PRATIQUÉ SANS EFFET** | Reco d'audit contournée sans ADR, déclarée « résolue » à tort |
| 6. Réalité opérationnelle | **VIOLÉ** (historique) | ROADMAP 1397 l. pour un solo ; contradictions internes ; IaC partielle |

Seuls pleinement conformes : le confinement `europe-west9`/`gemini-2.5-flash` (pilier 2), l'auth JWT testée et le
CRUD profil testé (pilier 4).

---

## 6. Décision de restructuration : VOIE MÉDIANE (recommandation unanime)

### CONSERVER (sain, conforme, coûteux à refaire)
- Auth JWT (12 tests) + CRUD profil (9 tests) — seules briques conformes au pilier 4.
- Confinement `europe-west9`/Gemini + prompts + harnais d'evals — seul choix pleinement conforme au pilier 2, actif.
- Modèle PostgreSQL/JSONB, Docker multi-stage, structure du monorepo.
- Les documents reconstruits (00, 01, ONBOARDING) — moyennant les corrections MIN-10 et l'élargissement §4.2.
- **À auditer puis probablement récupérer** : l'UI de `feature/dashboard-and-editor` (dashboard + GenerateCVModal).

### RÉÉCRIRE / REFONDER (violation structurelle, mais réutilise l'existant)
- **Les contrats** (`/contrats`) : chantier fondateur, OpenAPI + schémas partagés générés. Sans lui, tout rechute.
- **`routes/cv.py`** : re-piloté par tests (TDD), passé en asynchrone, aligné sur le contrat unifié.
- **La roadmap** : `04_ROADMAP.md` re-séquencée sur la capacité réelle (solo), périmètre V1 fortement tranché.
- **La sécurité** : agents privés, RFC 7807, rate limiting, moindre privilège, RGPD (suppression compte).

### JETER (violation nette, coût de maintenance > valeur)
- Le service `parser-pdf` en tant que microservice (déployé, jamais branché) → fonction backend si l'import PDF est V1, sinon suppression.
- La transformation runtime des skills dans `cv.py` → à dissoudre dans le contrat unifié, pas à étendre.
- Le statut « ✅ RÉSOLU » du rapport de bug historique → requalifier.
- Le contournement `datetime.utcnow()` de la branche feature → remplacer par la correction propre `timezone`.

**Pourquoi pas repartir de zéro** : les briques conformes (auth testée, evals, souveraineté) sont le travail le plus
dur à refaire et sont saines ; les jeter détruirait de la valeur pour une dette localisée (`cv.py` + contrats).
**Pourquoi pas restaurer tel quel** : conserver 3 microservices (dont un mort) et la génération synchrone
reconduirait les violations des piliers 2 et 6.

---

## 7. Séquence recommandée (respecte les points d'arrêt humains — à valider avant exécution)

0. **[Humain]** Trancher les questions ouvertes (§8) et le sort de `feature/dashboard-and-editor`.
1. **Débloquer l'accès** (BLK-1) : décision Stripe vs seed admin propre.
2. **`/contrats`** (BLK-3, MAJ-9, §4.2) : OpenAPI unique backend+agents, types régénérés des deux côtés, test de
   contrat en CI. **→ point d'arrêt : validation humaine.**
3. **Hotfix `cv.py` piloté TDD** (BLK-2, BLK-6), une fois le contrat posé : test rouge → correction `timezone` propre →
   alignement contrat → vert. Ne PAS coder avant le contrat (sous peine de rejouer l'inversion contract-first).
4. **ADR** : acter sync→async (MAJ-1/MAJ-2) et l'écart d'audit skills (MIN-8).
5. **Sécurité** (BLK-4, BLK-5, MAJ-3 à MAJ-7) : agents privés, RFC 7807, rate limiting, moindre privilège, RGPD.
6. **IaC + CI/CD** (MAJ-8) : Cloud Run/IAM/Secrets dans Terraform, pipeline prod, lint + scan sécu, garde-fous infra.
7. **`/roadmap`** recalibrée. **→ point d'arrêt : validation humaine.**

---

## 8. Questions ouvertes (à trancher par l'humain avant `/roadmap`)

1. **Sort de `feature/dashboard-and-editor`** : auditer et récupérer l'UI, ou repartir ? (contient le travail « perdu »)
2. **Déblocage V1** : intégration Stripe complète, ou bypass admin propre (seed/migration) pour une première V1 ?
3. **Import PDF** : indispensable V1 ? Si oui, comme fonction backend (recommandé) plutôt que microservice ?
4. **Génération asynchrone** : accepte-t-on file + polling/SSE en V1 (fortement recommandé) ?
5. **Modèle éco** : « Pass temporaire » confirmé, ou freemium (1 CV gratuit) ?
6. **Export PDF** : client (rapide) ou serveur WeasyPrint + GCS (« ultra-pro ») ?
7. **Budget GCP** cible staging + prod (dimensionne min-instances vs cold starts).
8. **État réel de l'infra GCP** : projet actif/facturé ? Services Cloud Run staging encore déployés ? (audit `gcloud`
   lecture seule recommandé — non réalisé dans cette passe).
