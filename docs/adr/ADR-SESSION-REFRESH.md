# ADR-SESSION-REFRESH — Session : access token court + refresh token en base

- **Statut** : Accepté (2026-07-11)
- **Décideur** : fondateur (arbitrage explicite avant implémentation)
- **Contexte technique** : auth FastAPI (JWT HS256), frontend Next.js/axios.

## Contexte

Avant ce changement : un unique **access token JWT stateless** de 30 min, sans
refresh ni révocation. Double problème : (a) UX — la session expire vite, l'utilisateur
est déconnecté ; (b) sécurité — un token ne peut pas être révoqué (dette notée dans
[ADR-RGPD-ERASURE] : la suppression de compte laissait une fenêtre résiduelle).
Redis tourne dans la stack mais n'était pas branché sur l'auth.

## Décision

**Access token court (15 min, stateless) + refresh token long (30 j) stocké en
base, à rotation, porté par un cookie httpOnly.**

- **Modèle `refresh_tokens`** (FK `user_id` `ondelete=CASCADE`) : on stocke le
  **SHA-256** du token opaque, jamais la valeur brute (une fuite DB ne donne pas de
  sessions utilisables). Migration `d3b4c5d6e7f8`.
- **Rotation à usage unique** : chaque `POST /auth/refresh` révoque le token
  présenté et en émet un nouveau. Présenter un token déjà révoqué (réutilisation =
  signal de vol) **révoque toute la famille** de l'utilisateur.
- **Cookie httpOnly** (`talentious_refresh`), `SameSite=Lax`, `Secure` en production.
  Non lisible en JS → surface XSS réduite. `SameSite=Lax` suffit pour un déploiement
  same-site (localhost:3000↔:8000, ou app↔api en sous-domaines).
- **Endpoints** : `POST /auth/refresh` (échange + rotation), `POST /auth/logout`
  (révoque + efface le cookie, idempotent). Le login pose le cookie et renvoie
  l'access token dans le corps.
- **Révocation** : logout révoque le token courant ; la **suppression RGPD révoque
  toutes les sessions automatiquement** (cascade) — la dette d'ADR-RGPD-ERASURE est
  fermée (fenêtre résiduelle ramenée à ≤ 15 min, la durée de l'access token).
- **Front** : intercepteur axios — sur `401`, un **refresh silencieux** unique
  (promesse partagée pour dédupliquer les 401 concurrents) rejoue la requête ; en cas
  d'échec, teardown de session + redirection `/login`.

## Alternatives écartées

- **Révocation via Redis** (denylist jti) : révocation instantanée y compris de
  l'access token, mais met Redis sur le **chemin critique de l'auth** (si Redis
  tombe, l'auth casse) — risque de disponibilité pour un solo. La base est déjà la
  source de vérité et gère la cascade RGPD gratuitement.
- **Denylist Redis seule sans refresh** : ne résout pas l'UX « session longue » sans
  rallonger l'access token (moins sûr).

## Conséquences

- Sessions longues et fluides (refresh silencieux) **sans** access token long.
- Révocation réelle (logout, suppression de compte, détection de réutilisation).
- Vérifié : TDD `test_auth_refresh.py` (8 verts — rotation, réutilisation→famille
  brûlée, logout, cascade RGPD) ; e2e navigateur (cookie httpOnly non lisible en JS,
  refresh silencieux garde l'utilisateur connecté sur token expiré, logout révoque).

## Limites / dettes suivies

- **Fenêtre access token ≤ 15 min** : un access token reste valide jusqu'à `exp`
  même après révocation du refresh (les routes protégées rechargent l'utilisateur, donc
  suppression de compte = 401 immédiat ; seul un token encore vivant sur une route
  purement stateless survivrait ≤ 15 min). Acceptable ; une révocation d'access token
  exigerait la denylist Redis écartée ci-dessus.
- **Nettoyage des lignes expirées/révoquées** : pas de purge planifiée pour l'instant
  (table qui croît lentement). À ajouter (job périodique) avant montée en charge.
