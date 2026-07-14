"""
Transactional email service (Brevo).

Everything goes through ``send_email`` so the rest of the app never touches the
provider — swapping Brevo out later is a one-file change (see ADR-EMAIL). When
email is disabled (no API key — dev, tests, CI) nothing is sent over the network:
the message is logged instead, and route tests monkeypatch ``send_email`` to
assert on what would have been sent.
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"


async def send_email(
    *, to: str, subject: str, html: str, text: str | None = None
) -> None:
    """Send a transactional email (or log it when email is disabled).

    Never raises on a provider failure at the caller's expense beyond logging —
    callers decide whether a send is critical. Kept minimal and provider-specific
    logic isolated here.
    """
    if not settings.email_enabled or not settings.brevo_api_key:
        logger.info("Email not sent (email disabled) — to=%s subject=%r", to, subject)
        return

    payload = {
        "sender": {
            "name": settings.email_sender_name,
            "email": settings.email_sender_address,
        },
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
    }
    if text:
        payload["textContent"] = text

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            BREVO_ENDPOINT,
            headers={
                "api-key": settings.brevo_api_key,
                "content-type": "application/json",
                "accept": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
    logger.info("Email sent — to=%s subject=%r", to, subject)


# --- Business emails -------------------------------------------------------


def _shell(title: str, body_html: str) -> str:
    """Minimal, inline-styled HTML shell (email clients ignore <style>/external CSS)."""
    return (
        '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;'
        'max-width:520px;margin:0 auto;color:#1A202C">'
        f'<h1 style="color:#2D3748;font-size:20px">{title}</h1>'
        f"{body_html}"
        '<p style="color:#718096;font-size:12px;margin-top:32px">'
        "Talentious — l'IA qui révèle ton potentiel professionnel.</p>"
        "</div>"
    )


def _button(href: str, label: str) -> str:
    return (
        f'<a href="{href}" style="display:inline-block;background:#38A169;color:#fff;'
        "text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;"
        f'margin:16px 0">{label}</a>'
    )


async def send_verification_email(*, to: str, verify_url: str) -> None:
    """Confirm-your-address email sent at registration."""
    html = _shell(
        "Confirme ton adresse email",
        "<p>Bienvenue sur Talentious ! Confirme ton adresse email pour activer "
        "toutes les fonctionnalités de ton compte.</p>"
        f"{_button(verify_url, 'Confirmer mon adresse')}"
        '<p style="color:#718096;font-size:13px">Ce lien expire dans 24 heures. '
        "Si tu n'es pas à l'origine de cette inscription, ignore cet email.</p>",
    )
    text = f"Confirme ton adresse email sur Talentious : {verify_url}"
    await send_email(to=to, subject="Confirme ton adresse email", html=html, text=text)


async def send_password_reset_email(*, to: str, reset_url: str) -> None:
    """Password-reset email (used by the forgot-password flow)."""
    html = _shell(
        "Réinitialise ton mot de passe",
        "<p>Tu as demandé à réinitialiser ton mot de passe. Clique sur le bouton "
        "ci-dessous pour en choisir un nouveau.</p>"
        f"{_button(reset_url, 'Réinitialiser mon mot de passe')}"
        '<p style="color:#718096;font-size:13px">Ce lien expire dans 24 heures. '
        "Si tu n'es pas à l'origine de cette demande, ignore cet email : ton mot "
        "de passe reste inchangé.</p>",
    )
    text = f"Réinitialise ton mot de passe sur Talentious : {reset_url}"
    await send_email(
        to=to, subject="Réinitialise ton mot de passe", html=html, text=text
    )


async def send_welcome_email(*, to: str, dashboard_url: str) -> None:
    """Welcome email, sent once the address has been verified."""
    html = _shell(
        "Bienvenue sur Talentious !",
        "<p>Ton adresse est confirmée — ton compte est prêt. Remplis ton profil "
        "une fois, puis génère un CV taillé pour chaque offre en quelques minutes.</p>"
        f"{_button(dashboard_url, 'Créer mon premier CV')}",
    )
    text = f"Bienvenue sur Talentious ! Crée ton premier CV : {dashboard_url}"
    await send_email(to=to, subject="Bienvenue sur Talentious 🎉", html=html, text=text)


async def send_pass_purchase_email(
    *, to: str, pass_label: str, valid_until: str, dashboard_url: str
) -> None:
    """Purchase confirmation, triggered by the Stripe checkout webhook."""
    html = _shell(
        "Ton pass est actif",
        f"<p>Merci pour ton achat ! Ton <strong>{pass_label}</strong> est actif "
        f"jusqu'au <strong>{valid_until}</strong>. Tu peux générer des CV sans limite "
        "pendant toute sa durée.</p>"
        f"{_button(dashboard_url, 'Générer un CV')}"
        '<p style="color:#718096;font-size:13px">Le reçu de paiement t\'est envoyé '
        "séparément par Stripe.</p>",
    )
    text = f"Ton {pass_label} est actif jusqu'au {valid_until}."
    await send_email(
        to=to, subject="Confirmation d'achat — ton pass est actif", html=html, text=text
    )


async def send_account_deleted_email(*, to: str) -> None:
    """RGPD acknowledgement: confirms the account and all data were erased."""
    html = _shell(
        "Ton compte a été supprimé",
        "<p>Comme demandé, ton compte Talentious et l'ensemble de tes données "
        "(profil, CV, pass) ont été <strong>définitivement supprimés</strong>.</p>"
        "<p>Merci d'avoir essayé Talentious — tu peux recréer un compte à tout "
        "moment. Bonne continuation !</p>",
    )
    text = (
        "Ton compte Talentious et toutes tes données ont été définitivement supprimés."
    )
    await send_email(
        to=to, subject="Confirmation de suppression de ton compte", html=html, text=text
    )


async def send_password_changed_email(*, to: str) -> None:
    """Security notice sent right after a successful password change/reset."""
    html = _shell(
        "Ton mot de passe a été modifié",
        "<p>Le mot de passe de ton compte Talentious vient d'être modifié, et "
        "toutes tes sessions ont été déconnectées par sécurité.</p>"
        "<p style=\"color:#718096;font-size:13px\">Si tu n'es pas à l'origine de ce "
        "changement, réinitialise ton mot de passe immédiatement depuis la page "
        "« Mot de passe oublié » et contacte-nous.</p>",
    )
    text = (
        "Ton mot de passe Talentious a été modifié et tes sessions déconnectées. "
        "Si ce n'est pas toi, réinitialise-le immédiatement."
    )
    await send_email(
        to=to, subject="Ton mot de passe a été modifié", html=html, text=text
    )
