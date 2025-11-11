# 🔴 BUG CRITIQUE: Incompatibilité Structure Skills

## 📋 Résumé

**Sévérité:** 🔴 CRITIQUE - Bloque la génération de CV pour TOUT nouvel utilisateur  
**Status:** 🚨 NON RÉSOLU  
**Impact:** 100% des nouveaux utilisateurs en Phase 4  
**Découvert:** 11 novembre 2025 lors des tests Phase 3.5

---

## 🐛 Description du Problème

Il existe **TROIS structures différentes** pour les compétences dans le projet, créant un conflit majeur:

### 1. Frontend/Backend (Interface utilisateur)
**Fichiers:**
- `frontend/src/types/profile.ts` (ligne 48-51)
- `backend/app/schemas/profile.py` (ligne 50-52)
- `backend/app/routes/profile.py` (ligne 54)

**Structure:**
```typescript
skills: {
  hard: string[],   // ["React", "TypeScript", "Node.js"]
  soft: string[]    // ["Communication", "Leadership"]
}
```

### 2. Agents IA (Rédacteur-CV, Analyseur-Offre)
**Fichiers:**
- `agents/redacteur-cv/app/models.py` (ligne 63-67)
- `agents/analyseur-offre/app/models.py` (similaire)

**Structure:**
```python
skills: List[Skill]  # [{name: "React", level: "expert", category: "hard_skill"}]

class Skill(BaseModel):
    id: Optional[str] = None
    name: str
    category: Optional[str] = None  # "hard_skill" or "soft_skill"
    level: Optional[str] = None
```

### 3. Base de Données (État actuel)
**Structure mixte** selon l'utilisateur:
- Nouveaux utilisateurs: `{hard: [], soft: []}` (profil vide auto-créé)
- Anciens utilisateurs: Mix des deux structures

---

## 🧪 Tests Effectués

### Test 1: Utilisateur Existant (orchestrator_test@talentious.com)
- **Profil initial:** `skills: {hard: [], soft: []}` ❌
- **Après correction manuelle:** `skills: [{name: "React", level: "expert"}]` ✅
- **Génération CV:** ✅ SUCCÈS (200 OK)

### Test 2: Nouvel Utilisateur (test_struct_XXX@talentious.com)
- **Profil auto-créé:** `skills: {hard: [], soft: []}` ⚠️
- **Après PUT /profile:** `skills: {hard: ["React"], soft: ["Communication"]}` ⚠️
- **Génération CV:** ❌ **422 Unprocessable Entity**

---

## 🔍 Cause Racine

### Problème 1: Profil Vide Invalide
`backend/app/routes/profile.py` ligne 54:
```python
"skills": {"hard": [], "soft": []},  # ❌ INCOMPATIBLE avec agents IA
```

Chaque fois qu'un nouvel utilisateur appelle `GET /profile`, un profil vide est créé avec cette structure.

### Problème 2: Schéma Pydantic Frontend/Backend
`backend/app/schemas/profile.py` ligne 50-52:
```python
class Skills(BaseModel):
    """Skills schema - matches frontend Skills interface."""
    hard: List[str] = Field(default_factory=list)
    soft: List[str] = Field(default_factory=list)
```

Ce schéma accepte `{hard: [], soft: []}` lors de `PUT /profile`, mais les agents IA rejettent cette structure.

### Problème 3: Validation Pydantic
Quand le profil est récupéré depuis PostgreSQL (JSONB), Pydantic du **backend** lui-même échoue à valider la structure, causant une erreur 422 **AVANT même** d'appeler les agents IA.

---

## 💥 Impact

### Phase 3 (Actuelle)
- ✅ Tests unitaires des agents: OK (données manuelles)
- ⚠️  Tests intégration: CASSÉS pour nouveaux utilisateurs
- ✅ Fonctionne UNIQUEMENT après correction manuelle SQL

### Phase 4 (Frontend Integration) 
- 🔴 **BLOQUANT TOTAL**
- 100% des nouveaux utilisateurs ne pourront PAS générer de CV
- Le frontend enverra `{hard: [], soft: []}` comme documenté
- Le backend rejettera avec 422 OU passera aux agents qui rejetteront avec 502

### Production
- 🔴 **SHOW STOPPER**
- Impossible de déployer en l'état actuel

---

## 🎯 Solutions Possibles

### Option A: Adopter la Structure Frontend (RECOMMANDÉ)
**Avantage:** Pas de changement frontend, compatible TypeScript/Pydantic  
**Inconvénient:** Refactoring complet des agents IA

**Actions:**
1. Modifier `agents/redacteur-cv/app/models.py`:
   ```python
   class Skills(BaseModel):
       hard: List[str]
       soft: List[str]
   ```

2. Adapter les prompts des agents pour cette structure simple

3. Mise à jour `agents/analyseur-offre` pour retourner `{hard: [], soft: []}`

4. Migration données existantes: `{hard: [], soft: []}` est déjà la norme

### Option B: Adopter la Structure Agents IA
**Avantage:** Meilleure granularité (level, category)  
**Inconvénient:** Changements massifs Frontend + Backend

**Actions:**
1. Modifier `frontend/src/types/profile.ts`:
   ```typescript
   interface Skill {
       id?: string;
       name: string;
       level?: string;      // "expert", "advanced", "intermediate", "beginner"
       category?: string;   // "hard_skill", "soft_skill"
   }
   
   skills: Skill[]
   ```

2. Refactoring formulaire frontend pour saisir `level` et `category`

3. Modifier `backend/app/schemas/profile.py`

4. Migration base de données **OBLIGATOIRE** (transformer `{hard: [], soft: []}` en `[{name, level, category}]`)

### Option C: Couche de Transformation (DÉCONSEILLÉ)
Transformer les données entre les couches → **Complexité**, **bugs**, **maintenance**

---

## ✅ Décision Recommandée

**Adopter Option A - Structure Frontend {hard: [], soft: []}**

**Raisons:**
1. ✅ Simplicité pour l'utilisateur (pas de "level" à renseigner)
2. ✅ Pas de changement frontend (déjà implémenté)
3. ✅ Données existantes majoritairement compatibles
4. ✅ Refactoring limité (agents IA uniquement)
5. ✅ Pydantic validation fonctionne out-of-the-box

**Limites acceptables:**
- Pas de granularité "expert vs intermediate" → Les agents IA peuvent **inférer** le niveau depuis les expériences
- Catégorisation hard/soft explicite → Simplifie l'UX

---

## 📝 Plan d'Action

### Phase 1: Fix Urgent (AVANT Phase 4)
- [ ] **1.1** Modifier `backend/app/routes/profile.py` ligne 54:
  ```python
  "skills": [],  # Vide au lieu de {hard: [], soft: []}
  ```
  
- [ ] **1.2** Créer migration Pydantic pour transformer old→new:
  ```python
  # Dans cv.py, avant d'appeler writer_client
  if isinstance(profile_data.get('skills'), dict):
      # Old structure
      skills_dict = profile_data['skills']
      profile_data['skills'] = []
      for skill_name in skills_dict.get('hard', []):
          profile_data['skills'].append({
              "name": skill_name,
              "level": "advanced",  # Valeur par défaut
              "category": "hard_skill"
          })
      for skill_name in skills_dict.get('soft', []):
          profile_data['skills'].append({
              "name": skill_name,
              "level": "intermediate",
              "category": "soft_skill"
          })
  ```

### Phase 2: Refactoring Agents IA
- [ ] **2.1** Modifier `agents/redacteur-cv/app/models.py`:
  - Remplacer `skills: List[Skill]` par `skills: Skills` (avec `Skills = {hard: List[str], soft: List[str]}`)
  
- [ ] **2.2** Adapter `agents/redacteur-cv/prompts/redacteur.txt`:
  - Ajuster le prompt pour travailler avec `{hard: [], soft: []}`
  
- [ ] **2.3** Modifier `agents/analyseur-offre/app/models.py`:
  - Même transformation pour cohérence

### Phase 3: Migration Données (Si nécessaire)
- [ ] **3.1** Script SQL pour uniformiser:
  ```sql
  -- Transformer {hard: [], soft: []} → skills: []
  -- OU garder {hard: [], soft: []} si Option A choisie
  ```

### Phase 4: Tests Complets
- [ ] **4.1** Tests unitaires agents IA avec nouvelle structure
- [ ] **4.2** Tests intégration backend→agents
- [ ] **4.3** Tests end-to-end nouveau user flow

---

## ⏱️ Estimation

- **Option A (RECOMMANDÉ):** 4-6 heures
  - 1h: Fix backend profile.py
  - 2h: Refactoring agents IA (models + prompts)
  - 1h: Tests
  - 0.5h: Migration données (minimal)
  - 0.5h: Documentation

- **Option B:** 12-16 heures
  - 4h: Refactoring frontend (TypeScript interfaces + formulaires)
  - 3h: Backend schemas + validation
  - 3h: Migration base de données
  - 2h: Tests complets
  - 1h: Documentation

---

## 🚨 Risques si Non Résolu

1. **Phase 4 bloquée** - Frontend ne peut pas s'intégrer
2. **Expérience utilisateur cassée** - 422 errors à chaque tentative de génération
3. **Perte de confiance** - Utilisateurs beta frustrés
4. **Dette technique** - Workarounds fragiles
5. **Blocage production** - Show stopper pour le lancement

---

## 📚 Fichiers Impactés

### Backend
- `backend/app/routes/profile.py` (ligne 54)
- `backend/app/schemas/profile.py` (ligne 50-52, 87)
- `backend/app/routes/cv.py` (nouveau: transformation layer)

### Frontend
- `frontend/src/types/profile.ts` (ligne 48-51, 126-129)

### Agents IA
- `agents/redacteur-cv/app/models.py` (ligne 63-67, 102)
- `agents/redacteur-cv/prompts/redacteur.txt` (adapter prompt)
- `agents/analyseur-offre/app/models.py` (cohérence)

### Base de Données
- Migration SQL si nécessaire

---

**Date de découverte:** 11 novembre 2025  
**Rapporté par:** GitHub Copilot AI Agent  
**Priorité:** 🔴 P0 - CRITIQUE  
**Assigné:** À décider  
**Sprint:** Phase 4 (AVANT intégration frontend)
