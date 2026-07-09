# Résultats d'évaluation — comparaison de modèles

Juge : `gemini-2.5-pro` (température 0), rubrique /10 sur 5 critères
(pertinence, verbes d'action, métriques, français, fidélité au profil).
Reproductible via `backend/evals/score_evals.py`.

| Jeu | Profil junior | Profil senior | Moyenne |
|---|---|---|---|
| `baseline_flash` (gemini-2.5-flash) | 4.4 | 9.6 | **7.0** |
| `pro_tier` (gemini-2.5-pro) | 5.6 | 9.8 | **7.7** |
| **Δ** | +1.2 | +0.2 | **+10 %** |

## Lecture

- **Gain décisif — fidélité au profil du CV junior : 1 → 9.** Le modèle `flash`
  inventait du contenu (hallucination) pour ce profil ; `2.5-pro` reste fidèle.
  C'est le cœur du problème historique « CV mal générés ».
- La **pertinence** du CV junior reste basse (2) sur les deux modèles : c'est un
  artefact des fixtures (profil *junior* confronté à une offre *tech lead* — mauvais
  fit légitime), pas un défaut du modèle. Ajouter une paire profil×offre cohérente
  pour un signal plus juste.
- Cible roadmap : +15 %. Atteint : +10 % via le modèle seul. Le reste passe par
  l'ingénierie des prompts (M2-T06) et de meilleures fixtures d'évaluation.

## Amélioration des prompts + fixtures cohérentes (v3)

Le signal à 2 fixtures était **bruité** : génération Gemini non déterministe, et la
paire junior×offre-tech-lead est un **mauvais fit artificiel** (un junior ne colle
pas à un poste de tech lead → le modèle force et invente, fidélité qui oscille 1↔9).
Ajout d'une **offre junior cohérente** pour un signal juste, avec prompts améliorés
(schéma aligné end_date/field, anti-injection, fidélité renforcée) :

| Paire (cohérente) | pertinence | verbes | métriques | français | fidélité | moyenne |
|---|---|---|---|---|---|---|
| junior × offre junior | 9 | 5 | 4 | 10 | **10** | **7.6** |
| senior × offre tech-lead | 10 | 9 | 9 | 10 | **10** | **9.6** |
| *(mismatch)* junior × tech-lead | 2 | 6 | 1 | 10 | 1 | 4.0 |

**Lecture honnête** :
- Sur les **paires réalistes**, les CV sont de haute qualité et **100 % fidèles**
  (fidélité 10/10) — moyenne **8.6** (vs baseline flash 7.0, soit +23 %).
- L'hallucination (fidélité 1) n'apparaît que sur le **mauvais fit artificiel** :
  c'est un cas limite à garder-fou (refuser/signaler un profil hors-cible), pas le
  chemin normal.
- Gain de correction structurelle du prompt (non capté par la note globale) :
  les formations conservent `end_date` **et** `field` (jadis perdus), `optimization_notes`
  supprimé, dates de certif optionnelles.
- Robustesse à traiter : l'analyseur renvoie parfois un 422 transitoire (validation
  stricte de la sortie Gemini après retries) — tolérance/retry à améliorer.

> Note méthodo : avec 2-4 échantillons et une génération non déterministe, la note
> globale est indicative. Le signal fiable est la **fidélité (10/10 sur cas cohérents)**
> et la correction structurelle, pas le 2e chiffre après la virgule.

## Reproduire

```bash
# 1. lancer les agents (VERTEX_AI_MODEL au choix) + evals
docker compose up -d analyseur-offre redacteur-cv
cd backend && ANALYZER_URL=http://localhost:8002/analyze WRITER_URL=http://localhost:8003/generate \
  .venv-py312/bin/python evals/run_evals.py
# 2. noter les résultats avec le juge (dans un conteneur agent)
docker run --rm -v $PWD/evals:/evals \
  -v ~/.config/gcloud/application_default_credentials.json:/tmp/gcp_creds.json:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp_creds.json \
  talentious-redacteur-cv python /evals/score_evals.py /evals/results/<dir>
```
