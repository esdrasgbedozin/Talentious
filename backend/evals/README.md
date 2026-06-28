# 🧪 Système d'Évaluation (Evals) - Pipeline de Génération de CV

## 📋 Vue d'ensemble

Ce système d'évaluation teste automatiquement le pipeline complet de génération de CV en exécutant toutes les combinaisons possibles de profils utilisateur × offres d'emploi.

**Pipeline testé :**
```
Offre d'emploi (.txt)
    ↓
[Analyseur-Offre] → Analyse structurée (JSON)
    ↓
[Rédacteur-CV] + Profil utilisateur → CV optimisé (JSON)
    ↓
Résultat sauvegardé dans results/
```

## 🏗️ Structure des dossiers

```
backend/evals/
├── profiles/           # Profils utilisateur (.json)
│   ├── 01_junior_dev.json
│   ├── 02_senior_backend.json
│   ├── 03_data_scientist.json
│   ├── 04_devops.json
│   └── 05_product_manager.json
├── offers/            # Offres d'emploi (.txt)
│   ├── 01_tech_lead.txt
│   ├── 02_fullstack.txt
│   ├── 03_ml_engineer.txt
│   ├── 04_infra.txt
│   └── 05_pm.txt
├── results/           # Résultats des tests (générés)
│   ├── result_01_01.json  (Profil 1 × Offre 1)
│   ├── result_01_02.json  (Profil 1 × Offre 2)
│   └── ...
├── run_evals.py       # Script principal d'exécution
├── requirements.txt   # Dépendances Python
└── README.md          # Cette documentation
```

## 🚀 Utilisation

### Prérequis

1. **Services Docker en cours d'exécution :**
   ```bash
   cd /path/to/Talentious
   docker-compose up -d analyseur-offre redacteur-cv
   ```

2. **Installer les dépendances Python :**
   ```bash
   pip install -r backend/evals/requirements.txt
   ```

### Lancement des tests

**Méthode 1 : Depuis la racine du projet**
```bash
python backend/evals/run_evals.py
```

**Méthode 2 : Depuis le dossier evals**
```bash
cd backend/evals
python run_evals.py
```

### Sortie attendue

```
================================================================================
                🚀 DÉMARRAGE DES TESTS D'ÉVALUATION (EVALS)                
================================================================================

ℹ️  Chargement des profils...
✅ Profil chargé : 01_junior_dev.json
✅ Profil chargé : 02_senior_backend.json
...

ℹ️  Chargement des offres...
✅ Offre chargée : 01_tech_lead.txt
✅ Offre chargée : 02_fullstack.txt
...

================================================================================
                       📊 25 COMBINAISONS À TRAITER                         
================================================================================

ℹ️  Profils : 5
ℹ️  Offres : 5

================================================================================
          🔄 COMBINAISON 1/25: 01_junior_dev.json × 01_tech_lead.txt        
================================================================================

ℹ️  Étape 1/2 : Analyse de l'offre d'emploi...
✅ Offre analysée : 15 hard skills, 6 soft skills
ℹ️  Étape 2/2 : Génération du CV optimisé...
✅ CV généré : 3 expériences, 12 compétences
✅ Résultat sauvegardé : result_01_01.json

...

================================================================================
                      📈 RAPPORT FINAL DES ÉVALUATIONS                      
================================================================================

ℹ️  Total de combinaisons : 25
✅ Succès : 25/25

🎉 TOUS LES TESTS ONT RÉUSSI ! (100%)

ℹ️  Résultats disponibles dans : backend/evals/results
```

## 📊 Format des données

### Profils (`profiles/*.json`)

Structure basée sur le modèle Pydantic `UserProfileData` :

```json
{
  "personal_info": {
    "first_name": "Sophie",
    "last_name": "Martin",
    "email": "sophie.martin@example.fr",
    "phone": "+33 6 12 34 56 78",
    "linkedin": "https://linkedin.com/in/sophie-martin-dev",
    "address": "Lyon, France"
  },
  "experiences": [
    {
      "id": "exp_001",
      "title": "Développeuse Full-Stack Junior",
      "company": "StartupTech",
      "start_date": "2023-09",
      "end_date": null,
      "location": "Lyon, France",
      "description": "Description de l'expérience..."
    }
  ],
  "skills": [
    {
      "id": "skill_001",
      "name": "JavaScript",
      "category": "hard_skill",
      "level": "Intermédiaire"
    }
  ],
  "educations": [...],
  "projects": [...],
  "certifications": [...]
}
```

### Offres (`offers/*.txt`)

Texte brut de l'offre d'emploi (3-5 paragraphes) :

```
TECH LEAD FULL-STACK - PARIS (CDI)

Notre scale-up fintech recherche un·e Tech Lead Full-Stack...

RESPONSABILITÉS :
- Diriger techniquement une équipe de 6 développeurs
- Architecturer et développer des solutions scalables
...

PROFIL RECHERCHÉ :
- Minimum 5 ans d'expérience en développement Full-Stack
...
```

### Résultats (`results/*.json`)

Chaque fichier contient :

```json
{
  "metadata": {
    "profile_file": "01_junior_dev.json",
    "offer_file": "01_tech_lead.txt",
    "generated_at": "2025-11-11T12:30:45Z",
    "pipeline_version": "1.0.0"
  },
  "offer_analysis": {
    "hard_skills": [...],
    "soft_skills": [...],
    "seniority_level": "Senior",
    "responsibilities": [...],
    "tone": "professional"
  },
  "generated_cv": {
    "personal_info": {...},
    "summary": "...",
    "selected_experiences": [...],
    "highlighted_skills": [...],
    "selected_educations": [...],
    "selected_projects": [...],
    "selected_certifications": [...]
  }
}
```

## 🎯 Objectifs des Evals

1. **Validation de la qualité** : Vérifier que le pipeline génère des CV cohérents et pertinents
2. **Tests de régression** : Détecter les régressions après modifications du code
3. **Benchmarking** : Mesurer les performances (temps de réponse, taux de succès)
4. **Analyse qualitative** : Inspecter manuellement les résultats pour améliorer les prompts

## 🔍 Analyse des résultats

Après exécution, inspectez manuellement les fichiers dans `results/` :

```bash
# Lister tous les résultats
ls -lh backend/evals/results/

# Inspecter un résultat spécifique
cat backend/evals/results/result_01_01.json | jq .

# Compter les compétences sélectionnées
cat backend/evals/results/result_01_01.json | jq '.generated_cv.highlighted_skills | length'
```

## 📝 Ajout de nouveaux cas de test

**Ajouter un profil :**
1. Créer `backend/evals/profiles/06_new_profile.json`
2. Respecter la structure JSON du schéma `UserProfileData`
3. Relancer les tests

**Ajouter une offre :**
1. Créer `backend/evals/offers/06_new_offer.txt`
2. Écrire une offre réaliste (3-5 paragraphes)
3. Relancer les tests

Le script détecte automatiquement tous les fichiers `.json` et `.txt`.

## ⚙️ Configuration

Variables dans `run_evals.py` :

```python
ANALYZER_URL = "http://analyseur-offre:8002/analyze"
WRITER_URL = "http://redacteur-cv:8003/generate"
TIMEOUT = 120.0  # Timeout en secondes
```

Si vous testez en local (hors Docker) :
```python
ANALYZER_URL = "http://localhost:8002/analyze"
WRITER_URL = "http://localhost:8003/generate"
```

## 🐛 Dépannage

**Erreur : "Connection refused"**
→ Vérifier que les services Docker sont démarrés :
```bash
docker-compose ps
```

**Erreur : "Timeout"**
→ Augmenter `TIMEOUT` dans `run_evals.py` (pour les modèles Gemini lents)

**Erreur : "No profiles found"**
→ Vérifier que les fichiers `.json` sont bien dans `backend/evals/profiles/`

**Erreur HTTP 500**
→ Consulter les logs Docker :
```bash
docker-compose logs analyseur-offre
docker-compose logs redacteur-cv
```

## 📊 Métriques de qualité (à venir)

Futures améliorations prévues :
- **Score de pertinence** : % de compétences critiques présentes dans le CV généré
- **Cohérence linguistique** : Détection de franglais ou tournures maladroites
- **Longueur du résumé** : Validation 50-120 mots
- **Taux de sélection** : % d'expériences/projets/certifications conservés
- **Temps de génération** : Latence end-to-end par combinaison

## 📚 Ressources

- [Documentation Analyseur-Offre](../../agents/analyseur-offre/README.md)
- [Documentation Rédacteur-CV](../../agents/redacteur-cv/README.md)
- [ROADMAP.md](../../ROADMAP.md) - Phase 3.4
