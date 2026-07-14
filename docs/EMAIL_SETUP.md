# Configuration email — nom de domaine + Brevo (guide pas-à-pas)

Ce guide couvre les étapes **côté fondateur** pour activer les envois d'emails
réels (vérification d'adresse, mot de passe oublié, confirmations). Tant que ce
n'est pas fait, l'app fonctionne en **mode dev** : aucun email n'est envoyé, les
liens sont journalisés localement. Rien n'est bloquant.

---

## Vue d'ensemble (3 grandes étapes)

1. **Acheter un nom de domaine** (~10–15 €/an).
2. **Configurer Brevo** : authentifier le domaine (DKIM/SPF/DMARC), créer un
   expéditeur, générer une clé API.
3. **Brancher l'app** : renseigner les variables d'environnement.

Durée réelle : ~30–45 min + le temps de propagation DNS (quelques minutes à
quelques heures).

---

## Étape 1 — Acheter le nom de domaine

### Choisir le domaine
- **`.fr`** — cohérent avec le positionnement « hébergé en France ». Réservé aux
  résidents/entités de l'UE (OK pour toi). Ex. `talentious.fr`.
- **`.com`** — universel, si tu vises l'international plus tard.
- **`.app` / `.io`** — plus « tech », un peu plus chers.

Vérifie la disponibilité directement chez le registrar.

### Choisir le registrar (là où tu achètes + gères le DNS)
| Registrar | Pourquoi | Prix indicatif |
|---|---|---|
| **Cloudflare** | Le moins cher (prix coûtant), DNS excellent et rapide | ~10 €/an |
| **OVH** | Français, support FR, populaire | ~7–12 €/an |
| **Gandi** | Français, éthique, interface claire | ~15 €/an |

> Recommandation : **Cloudflare** (DNS rapide, pas de surcoût) ou **OVH** si tu
> préfères un acteur français avec support en français.

### Acheter
1. Crée un compte chez le registrar.
2. Recherche `talentious.fr` (ou ton choix), ajoute au panier, paie.
3. Tu accèdes ensuite à un **panneau DNS** (zone DNS) : c'est là que tu ajouteras
   les enregistrements demandés par Brevo à l'étape 2.

**Astuce contact** : crée aussi une adresse de contact réelle (ex.
`contact@talentious.fr`) redirigée vers ton Gmail, pour recevoir les réponses.
Un `noreply@` seul renvoie les réponses dans le vide.

---

## Étape 2 — Configurer Brevo

### 2.1 Créer le compte
1. Va sur [brevo.com](https://www.brevo.com), crée un compte (offre gratuite :
   300 emails/jour, largement suffisant en bêta).
2. Complète le profil demandé (Brevo vérifie parfois l'identité pour éviter le
   spam — normal).

### 2.2 Authentifier le domaine (DKIM / SPF / DMARC)
C'est **l'étape clé** pour que tes emails n'arrivent pas en spam.

1. Dans Brevo : **Senders, Domains & Dedicated IPs → Domains → Add a domain**.
2. Saisis `talentious.fr`.
3. Brevo affiche une liste d'**enregistrements DNS à ajouter**. Ils incluent en
   général :
   - un enregistrement **TXT de vérification** (« Brevo code ») — prouve que le
     domaine est à toi ;
   - un ou plusieurs enregistrements **DKIM** (TXT) — signature cryptographique
     des emails ;
   - un enregistrement **SPF** (TXT sur le domaine) — autorise Brevo à envoyer
     pour ton domaine, du type `v=spf1 include:spf.brevo.com ~all` ;
   - un enregistrement **DMARC** (TXT sur `_dmarc.talentious.fr`) —
     recommandé, du type `v=DMARC1; p=none; rua=mailto:contact@talentious.fr`.

   > **Copie les valeurs EXACTES affichées par Brevo** (elles varient selon le
   > compte). Ne recopie pas des exemples trouvés ailleurs.

4. Dans le **panneau DNS de ton registrar**, ajoute chaque enregistrement :
   - Type (TXT), **Nom/Host** (ce que Brevo indique — souvent un sous-domaine
     comme `brevo._domainkey` ou `@` pour la racine), **Valeur** (la longue
     chaîne fournie).
   - Sur Cloudflare : mets le **proxy sur « DNS only »** (nuage gris) pour ces
     enregistrements.
5. Reviens dans Brevo et clique **Verify / Authenticate**. Si le DNS n'a pas
   encore propagé, patiente et réessaie (jusqu'à quelques heures).

### 2.3 Créer l'expéditeur
1. Brevo : **Senders → Add a sender**.
2. Nom : `Talentious`. Email : `noreply@talentious.fr` (doit être sur le domaine
   authentifié).

### 2.4 Générer la clé API
1. Brevo : **SMTP & API → API Keys → Generate a new API key** (API v3).
2. **Copie la clé immédiatement** (elle ne s'affiche qu'une fois). Ne la commite
   JAMAIS dans le repo — elle va dans `.env` uniquement.

---

## Étape 3 — Brancher l'application

Dans le fichier `.env` (backend), renseigne :

```env
EMAIL_ENABLED=true
BREVO_API_KEY=xkeysib-...        # la clé générée en 2.4 — jamais commitée
EMAIL_SENDER_ADDRESS=noreply@talentious.fr
EMAIL_SENDER_NAME=Talentious
FRONTEND_BASE_URL=https://talentious.fr   # ou l'URL de ton frontend déployé
```

- En **local**, laisse `EMAIL_ENABLED=false` (ou omets la clé) : aucun envoi,
  les liens de vérification/reset sont journalisés (visibles avec
  `LOG_LEVEL=INFO`).
- En **production**, ces variables passeront par **Secret Manager** (cf.
  roadmap M6-T04), pas par un `.env` en clair.

### Tester
1. Redémarre le backend avec ces variables.
2. Inscris un compte avec **ta vraie adresse**.
3. Tu dois recevoir l'email « Confirme ton adresse email ». S'il est en spam,
   c'est que DKIM/SPF ne sont pas encore validés — revérifie l'étape 2.2.

---

## Récapitulatif des variables

| Variable | Rôle | Dev | Prod |
|---|---|---|---|
| `EMAIL_ENABLED` | Active l'envoi réel | `false` | `true` |
| `BREVO_API_KEY` | Clé API Brevo (secret) | vide | via Secret Manager |
| `EMAIL_SENDER_ADDRESS` | Expéditeur (`noreply@…`) | défaut | `noreply@talentious.fr` |
| `EMAIL_SENDER_NAME` | Nom affiché | `Talentious` | `Talentious` |
| `FRONTEND_BASE_URL` | Base des liens dans les emails | `http://localhost:3000` | URL prod |

Quand tu as fait tout ça, donne-moi le domaine choisi : je finalise la config
(expéditeur, URL) et on passe en envoi réel.
