# ADR-EMAIL — Fournisseur d'email transactionnel

- **Statut** : Accepté (2026-07-13)
- **Décideur** : fondateur (arbitrage explicite)
- **Contexte technique** : envoi d'emails transactionnels (vérification d'adresse, réinitialisation de mot de passe, confirmations). Backend FastAPI.

## Contexte

La V1 a besoin d'emails transactionnels (M7). Le produit met en avant un positionnement « hébergé en France / RGPD » ; la cohérence pousse vers un fournisseur dont les données restent dans l'UE. Le fondateur édite aujourd'hui en tant que particulier, sans nom de domaine dédié (achat prévu).

## Décision

**Fournisseur : Brevo (ex-Sendinblue), société française, serveurs UE, RGPD natif.**

- Envoi via l'**API transactionnelle Brevo** (`POST https://api.brevo.com/v3/smtp/email`), en HTTP direct (`httpx`), sans SDK tiers supplémentaire.
- **Abstraction** : tout passe par `app/services/email_service.py` (`send_email(...)` + helpers métier). Le reste de l'app ignore le fournisseur → en changer plus tard est trivial.
- **Désactivé par défaut** : sans `BREVO_API_KEY` (dev, tests, CI), aucun envoi réel — l'email est journalisé. Les envois réels ne s'activent qu'avec la clé + un expéditeur vérifié configurés. Config : `BREVO_API_KEY`, `EMAIL_SENDER_ADDRESS`, `EMAIL_SENDER_NAME`, `EMAIL_ENABLED`, `FRONTEND_BASE_URL` (pour construire les liens).
- **Domaine d'envoi** : un nom de domaine dédié (DKIM/SPF) sera configuré avant la mise en ligne réelle pour la délivrabilité (achat en cours). En bêta/dev, expéditeur unique vérifié / mode désactivé.

## Alternatives écartées

- **Resend** — meilleure DX mais société US (région UE + DPA disponibles) ; moins aligné que Brevo sur le message « données en France ».
- **Mailjet** — FR/UE également valable ; Brevo retenu pour sa simplicité et son offre gratuite suffisante en bêta.
- **Amazon SES** — le moins cher à l'échelle mais ajoute une dépendance AWS à une stack GCP, et plus de configuration.

## Conséquences

- Envoi testable sans réseau (désactivé → journalisé) ; `email_service.send_email` est monkeypatchable dans les tests de routes.
- Bascule prod = renseigner `BREVO_API_KEY` + `EMAIL_ENABLED=true` + expéditeur vérifié sur le domaine.

## Prérequis suivis

- **Achat d'un nom de domaine** (côté fondateur) puis configuration DKIM/SPF chez Brevo — requis avant les envois réels en production (délivrabilité).
