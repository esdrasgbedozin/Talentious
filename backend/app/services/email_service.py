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
