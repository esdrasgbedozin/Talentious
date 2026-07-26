"""
Vérification des jetons d'identité Google (Sign in with Google, M8-T03).

Flux « credential » de Google Identity Services : le frontend obtient un JWT
signé par Google, le backend vérifie signature + audience + expiration via
google-auth. Aucun secret requis : seul le client ID (public) est configuré.
"""

import logging

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings

logger = logging.getLogger(__name__)


def verify_credential(credential: str) -> dict:
    """Vérifie un jeton d'identité Google et retourne ses claims.

    Appel réseau synchrone (récupération des clés publiques Google, mise en
    cache par la lib) : à exécuter via asyncio.to_thread côté route.

    Raises:
        ValueError: jeton invalide, expiré, ou audience inattendue — y compris
        lorsque le client ID n'est pas configuré (fail-closed).
    """
    client_id = settings.google_oauth_client_id
    if not client_id:
        # Fail-closed : sans client ID configuré, aucune vérification
        # d'audience n'est possible — on refuse tout.
        raise ValueError("GOOGLE_OAUTH_CLIENT_ID is not configured")

    return id_token.verify_oauth2_token(
        credential, google_requests.Request(), audience=client_id
    )
