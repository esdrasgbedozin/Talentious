# Scénarios de test e2e — Talentious

Scénarios manuels réels pour valider les fonctionnalités et remonter les bugs
avant de passer à la suite (déploiement, RGPD, etc.).

## Comptes de test

| Compte | Identifiants | État | Usage |
|---|---|---|---|
| **Junior équipé** | `yanis.benali@example.fr` / `DevOps2026!` | Profil complet + **pass 90 j actif** | Tester génération / édition / export sans friction |
| **Admin** | `admin@talentious.fr` / `adminpassword` | Profil « Alexandre Dubois » + pass | Admin / données riches |
| **Compte neuf** | à créer toi-même | sans pass | Tester inscription + 402 + paiement |

**Pré-requis paiement** : le webhook local est transféré par `stripe listen`.
S'il n'est plus actif, relance dans un terminal :
```
stripe listen --forward-to localhost:8000/billing/webhook
```
Carte de test : `4242 4242 4242 4242`, date future quelconque, CVC quelconque.

---

## 1. Authentification & session

**1.1 Inscription** — `/register` : email + mot de passe (≥ 8 car.) + confirmation.
- ✅ Attendu : redirection vers `/login?registered=true`, puis connexion OK.
- 🐞 Vérifier : mot de passe < 8 caractères refusé ; email déjà utilisé → message clair ; mots de passe non identiques refusés.

**1.2 Connexion / déconnexion** — se connecter, puis menu utilisateur → « Se déconnecter ».
- ✅ Attendu : après login → onboarding ; après logout → landing, et `/dashboard` renvoie vers `/login`.

**1.3 Session expirée** — rester inactif > ~90 min (ou vider le cookie) puis naviguer.
- ✅ Attendu : redirection **propre** vers `/login` (pas de page qui boucle).
- 🐞 Historiquement bug de boucle /login→/onboarding→/profile : vérifier que c'est bien réglé.

## 2. Profil (compte Yanis)

**2.1 Consultation** — `/profile` : toutes les sections doivent afficher « Complété » et les données (2 exp., 2 formations, 24 compétences, 3 projets, 4 certifs).

**2.2 Édition & sauvegarde** — modifier un champ (ex. ville), « Sauvegarder mon profil ».
- ✅ Attendu : message de succès ; après rechargement, la modif persiste.
- 🐞 Vérifier : ajout/suppression d'une expérience/formation/projet/certif ; ajout/retrait de compétences (Entrée pour ajouter) ; caractères spéciaux/accents.

## 3. Génération de CV (compte Yanis, pass actif)

**3.1 Génération réussie** — Dashboard → « Générer un nouveau CV » → nom + coller une **vraie offre** (voir annexe) → Générer.
- ✅ Attendu : lobby d'attente animée (barre de progression, étapes) — **jamais d'écran noir** ; à la fin, la modale se ferme, un toast succès, le CV apparaît en tête du dashboard.
- 🐞 Vérifier : offre < 50 caractères → bouton désactivé + compteur rouge ; champs vides → avertissement.

**3.2 Pertinence du contenu** — ouvrir le CV généré (éditeur/aperçu).
- ✅ Attendu : le CV met en avant les expériences/compétences **pertinentes pour l'offre** (DevOps/Cloud si offre DevOps, Full-Stack si offre dev). Résumé cohérent.
- 🐞 Générer 2 CV avec 2 offres différentes (une DevOps, une Full-Stack) et comparer : le contenu doit s'adapter.

**3.3 Sans pass (402)** — se connecter avec un **compte neuf sans pass**, tenter une génération.
- ✅ Attendu : redirection automatique vers `/billing`.

## 4. Éditeur + rendu + export PDF

**4.1 Éditeur** — Dashboard → « Éditer » sur un CV.
- ✅ Attendu : deux panneaux (édition à gauche, **aperçu A4 live à droite**) ; toutes les sections chargées.
- 🐞 Modifier un champ → l'aperçu se met à jour **en direct** ; « Enregistrer » s'active quand il y a des modifs.

**4.2 Garde « non sauvegardé »** — modifier sans enregistrer puis tenter de quitter (bouton retour / fermer l'onglet).
- ✅ Attendu : demande de confirmation avant de perdre les modifications.

**4.3 Sauvegarde** — « Enregistrer » → recharger la page.
- ✅ Attendu : modifications persistées ; « Enregistrer » redevient inactif.

**4.4 Export PDF** — bouton « Aperçu / PDF » (éditeur) ou « Télécharger PDF » (dashboard).
- ✅ Attendu : rendu A4 propre (en-tête, profil, expériences, formation, compétences, projets, certifications) ; le dialogue d'impression permet « Enregistrer en PDF » ; le fichier porte le nom du CV.
- 🐞 Vérifier le PDF sur 1 vs 2 pages (CV long) ; les accents et les puces ; pas de section coupée au milieu.

## 5. Facturation (Stripe, compte neuf sans pass)

**5.1 Prix affichés** — `/billing`.
- ✅ Attendu : Pass 30 j = **5,00 €**, Pass 90 j = **12,00 €** ; bandeau « Paiement sécurisé par Stripe ».

**5.2 Paiement réussi** — « Choisir ce Pass » → page Stripe → carte `4242 4242 4242 4242` → payer.
- ✅ Attendu : redirection vers `/billing/success` ; le pass s'active (retour au dashboard, génération débloquée). Le webhook crée le CareerPass.
- 🐞 Vérifier `has_active_pass` en réessayant une génération (plus de 402).

**5.3 Paiement annulé** — lancer un checkout puis « Back »/annuler.
- ✅ Attendu : page `/billing/cancelled`, aucun pass créé, aucun débit.

**5.4 Carte refusée** — carte `4000 0000 0000 0002` (declined).
- ✅ Attendu : Stripe affiche l'échec ; aucun pass créé.

## 6. Suppression

**6.1 Supprimer un CV** — dashboard → poubelle → confirmer.
- ✅ Attendu : dialogue de confirmation ; après confirmation, le CV disparaît, toast succès.
- 🐞 Annuler la confirmation ne doit rien supprimer.

> ⚠️ **Suppression de compte (RGPD)** : pas encore implémentée (ni backend ni UI). À construire — ne pas tester.

## 7. Robustesse / cas limites / responsive

- **7.1 Mobile** : rejouer 2.x, 3.1, 4.1 en largeur mobile (~375px). Vérifier la navbar (menu), les modales, l'éditeur (l'aperçu live est masqué en mobile — normal).
- **7.2 Accessibilité clavier** : ouvrir la modale de génération → `Tab` reste piégé dans la modale, `Échap` la ferme ; menu utilisateur navigable au clavier.
- **7.3 Offre très longue** : coller une offre de plusieurs milliers de caractères → génération OK, pas de plantage.
- **7.4 Double génération** : lancer une génération, attendre, en relancer une autre → pas d'état incohérent (une seule génération active à la fois côté backend).
- **7.5 Rechargement pendant génération** : recharger la page pendant la lobby → le CV se crée quand même (job asynchrone côté serveur) et apparaît au dashboard.

---

## Annexe — offres d'emploi de test (à coller dans le générateur)

**Offre A — DevOps / Cloud (junior)**
> Nous recherchons un(e) ingénieur(e) DevOps junior pour renforcer notre équipe plateforme. Vous automatiserez nos pipelines CI/CD (GitLab CI), provisionnerez notre infrastructure sur AWS avec Terraform, et fiabiliserez nos déploiements Kubernetes. Vous participerez au monitoring (Prometheus/Grafana) et à l'amélioration continue de la fiabilité. Profil : première expérience (stage/alternance) en cloud et conteneurs, maîtrise de Docker, Linux et d'un langage de scripting (Python/Bash). Rigueur, autonomie et esprit d'équipe indispensables.

**Offre B — Développeur Full-Stack (junior)**
> Startup en forte croissance, nous cherchons un(e) développeur(se) full-stack junior. Stack : React/TypeScript côté front, Node.js et PostgreSQL côté back, le tout conteneurisé (Docker) et déployé en CI/CD. Vous développerez de nouvelles fonctionnalités produit de bout en bout, participerez aux revues de code et à la qualité (tests automatisés). Profil : bases solides en JavaScript/TypeScript, appétence produit, curiosité et envie d'apprendre vite.

> Le CV généré pour l'offre A doit mettre en avant le versant DevOps/Cloud du profil ;
> celui pour l'offre B, le versant Full-Stack. C'est le cœur de valeur — à vérifier en priorité.
