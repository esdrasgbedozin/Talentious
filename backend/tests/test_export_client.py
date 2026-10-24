"""M2-T14 — export_client : httpx + OIDC, timeouts, mapping d'erreurs SÛR.

Critères du ticket : (respx) les en-têtes OIDC partent quand l'IAM auth est
active ; 5xx ⇒ erreur SÛRE — le corps renvoyé par le service n'est JAMAIS
reflété dans l'exception (contrairement au pattern historique des clients
agents, dette tracée). Le x-request-id est propagé (corrélation M2-T12).
"""

import httpx
import pytest
import respx

from app.services import export_client
from app.services.export_client import (
    ExportRejectedError,
    ExportUnavailableError,
    render_pdf,
)

BASE = export_client.EXPORT_SERVICE_URL

PAYLOAD_ARGS = dict(
    cv_content={
        "personal_info": {"first_name": "T", "last_name": "T", "email": "t@t.fr"}
    },
    template_id="modern_sobre",
    theme={
        "color_accent": "#2D3748",
        "color_text": "#1A202C",
        "color_muted": "#4A5568",
        "color_background": "#FFFFFF",
        "font_heading": "Inter",
        "font_body": "Inter",
    },
    language="fr",
)


@pytest.mark.asyncio
@respx.mock
async def test_render_pdf_nominal_renvoie_les_octets_et_propage_request_id():
    route = respx.post(f"{BASE}/render/pdf").mock(
        return_value=httpx.Response(
            200, content=b"%PDF-1.7 fake", headers={"content-type": "application/pdf"}
        )
    )
    pdf = await render_pdf(**PAYLOAD_ARGS, request_id="corr-77")
    assert pdf.startswith(b"%PDF-")
    sent = route.calls.last.request
    assert sent.headers["x-request-id"] == "corr-77"
    body = sent.read()
    assert b"modern_sobre" in body and b'"language"' in body


@pytest.mark.asyncio
@respx.mock
async def test_entetes_oidc_presents_quand_iam_auth_active(monkeypatch):
    from app.config import settings
    from app.services import iam_auth

    monkeypatch.setattr(settings, "enable_iam_auth", True)
    monkeypatch.setattr(iam_auth, "_fetch_id_token", lambda audience: "jeton-oidc-test")
    route = respx.post(f"{BASE}/render/pdf").mock(
        return_value=httpx.Response(
            200, content=b"%PDF-ok", headers={"content-type": "application/pdf"}
        )
    )
    await render_pdf(**PAYLOAD_ARGS)
    assert route.calls.last.request.headers["authorization"] == "Bearer jeton-oidc-test"


@pytest.mark.asyncio
@respx.mock
async def test_5xx_erreur_sure_retryable_sans_reflet_du_corps():
    respx.post(f"{BASE}/render/pdf").mock(
        return_value=httpx.Response(500, text="SECRET_INTERNE_DU_SERVICE chemin=/app/x")
    )
    with pytest.raises(ExportUnavailableError) as exc:
        await render_pdf(**PAYLOAD_ARGS)
    assert "SECRET_INTERNE" not in str(exc.value)
    assert "500" in str(exc.value)


@pytest.mark.asyncio
@respx.mock
async def test_503_et_504_sont_retryables():
    for status in (503, 504):
        respx.post(f"{BASE}/render/pdf").mock(return_value=httpx.Response(status))
        with pytest.raises(ExportUnavailableError):
            await render_pdf(**PAYLOAD_ARGS)


@pytest.mark.asyncio
@respx.mock
async def test_4xx_erreur_non_retryable_sans_reflet():
    respx.post(f"{BASE}/render/pdf").mock(
        return_value=httpx.Response(
            422, json={"detail": "x", "invalid_params": [{"loc": ["VALEUR_REFLETEE"]}]}
        )
    )
    with pytest.raises(ExportRejectedError) as exc:
        await render_pdf(**PAYLOAD_ARGS)
    assert "VALEUR_REFLETEE" not in str(exc.value)
    assert "422" in str(exc.value)


@pytest.mark.asyncio
@respx.mock
async def test_timeout_et_panne_reseau_sont_retryables():
    respx.post(f"{BASE}/render/pdf").mock(side_effect=httpx.ConnectTimeout("boom"))
    with pytest.raises(ExportUnavailableError):
        await render_pdf(**PAYLOAD_ARGS)
    respx.post(f"{BASE}/render/pdf").mock(side_effect=httpx.ConnectError("refus"))
    with pytest.raises(ExportUnavailableError):
        await render_pdf(**PAYLOAD_ARGS)


@pytest.mark.asyncio
@respx.mock
async def test_200_sans_pdf_est_une_erreur_sure():
    respx.post(f"{BASE}/render/pdf").mock(
        return_value=httpx.Response(
            200, text="pas un pdf", headers={"content-type": "text/html"}
        )
    )
    with pytest.raises(ExportUnavailableError) as exc:
        await render_pdf(**PAYLOAD_ARGS)
    assert "pas un pdf" not in str(exc.value)
