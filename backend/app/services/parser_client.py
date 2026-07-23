"""
Parser-PDF Agent Client
Asynchronous client for communicating with the Parser-PDF microservice
"""

import os
import logging
from typing import Dict, Any, Optional

import httpx
from fastapi import UploadFile, HTTPException, status

from app.services import iam_auth

logger = logging.getLogger(__name__)

# Configuration
PARSER_SERVICE_URL = os.getenv("PARSER_SERVICE_URL", "http://parser-pdf:8001")
REQUEST_TIMEOUT = 60.0  # 60 seconds for PDF processing
# L'extraction structurée inclut un appel Gemini dont le thinking peut durer
# 60-90 s par tentative (×2 retries côté agent). Le service parser coupe à
# 300 s : on attend un peu plus pour recevoir SON erreur qualifiée plutôt
# qu'un timeout brut. Sans enjeu UX : l'appel vit dans une tâche de fond.
EXTRACT_TIMEOUT = 320.0


class ParserClient:
    """
    Async HTTP client for the Parser-PDF microservice
    """

    def __init__(self):
        """Initialize the Parser client"""
        self.base_url = PARSER_SERVICE_URL.rstrip("/")
        self.timeout = httpx.Timeout(REQUEST_TIMEOUT)
        logger.info(f"Parser client initialized with base URL: {self.base_url}")

    async def health_check(self) -> Dict[str, Any]:
        """
        Check if the parser service is healthy

        Returns:
            Health status dict

        Raises:
            HTTPException: If service is unreachable
        """
        try:
            # Shared IAM helper: ID token when agents are private, {} in dev.
            headers = await iam_auth.auth_headers(self.base_url)

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}/health", headers=headers)
                response.raise_for_status()
                return response.json()

        except httpx.HTTPError as e:
            logger.error(f"Parser service health check failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Parser service is unavailable",
            )

    async def parse_pdf(self, file: UploadFile) -> Dict[str, Any]:
        """
        Parse a PDF file and extract text content

        Args:
            file: Uploaded PDF file

        Returns:
            Dictionary with:
                - text: Extracted text content
                - page_count: Number of pages
                - character_count: Number of characters
                - filename: Original filename

        Raises:
            HTTPException: If parsing fails or service is unavailable
        """
        try:
            # Read file content
            file_content = await file.read()
            await file.seek(0)  # Reset file pointer for potential re-reads

            logger.info(
                f"Sending PDF to parser service: {file.filename} ({len(file_content)} bytes)"
            )

            # Shared IAM helper: ID token when agents are private, {} in dev.
            headers = await iam_auth.auth_headers(self.base_url)

            # Prepare multipart form data
            files = {"file": (file.filename, file_content, file.content_type)}

            # Send request to parser service
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/parse", files=files, headers=headers
                )

                # Handle response
                if response.status_code == 200:
                    result = response.json()
                    logger.info(
                        f"PDF parsed successfully: {result.get('page_count')} pages, "
                        f"{result.get('character_count')} characters"
                    )
                    return result

                # Handle parser service errors
                elif response.status_code == 400:
                    error_detail = response.json().get("detail", "Invalid PDF file")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST, detail=error_detail
                    )

                elif response.status_code == 422:
                    error_detail = response.json().get(
                        "detail", "PDF contains no extractable text"
                    )
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=error_detail,
                    )

                else:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Parser service returned an error",
                    )

        except HTTPException:
            # Re-raise HTTP exceptions
            raise

        except httpx.TimeoutException:
            logger.error(f"Parser service timeout for file: {file.filename}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="PDF parsing timed out. File may be too large or complex.",
            )

        except httpx.HTTPError as e:
            logger.error(f"Parser service error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Parser service is unavailable",
            )

        except Exception as e:
            logger.error(f"Unexpected error calling parser service: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to parse PDF",
            )

    async def extract_profile(
        self,
        content: bytes,
        filename: str,
        content_type: str = "application/pdf",
    ) -> Dict[str, Any]:
        """Import complet : PDF → ProfileData structuré via l'agent (LLM inclus).

        Prend les octets (pas l'UploadFile) : l'appel vit dans une tâche de
        fond, après la fin de la requête HTTP d'origine.

        Returns:
            {"profile_data": <brouillon canonique>, "warnings": [...]}

        Raises:
            HTTPException: erreurs métier de l'agent transmises (400/422),
            502/503/504 pour les indisponibilités.
        """
        headers = await iam_auth.auth_headers(self.base_url)
        files = {"file": (filename, content, content_type)}

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(EXTRACT_TIMEOUT)
            ) as client:
                response = await client.post(
                    f"{self.base_url}/extract-profile", files=files, headers=headers
                )

            if response.status_code == 200:
                result = response.json()
                logger.info(
                    "Profile extracted from %s (%d warnings)",
                    filename,
                    len(result.get("warnings", [])),
                )
                return result

            if response.status_code in (400, 422):
                # Erreurs métier (non-PDF, trop de pages, scan sans texte) :
                # transmises telles quelles au client final.
                detail = response.json().get("detail", "Invalid PDF file")
                raise HTTPException(status_code=response.status_code, detail=detail)

            # 502 agent (Vertex KO) et tout le reste → passerelle en échec.
            logger.error(
                "Extract-profile agent error %d: %s",
                response.status_code,
                response.text[:200],
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="L'import du CV a échoué. Réessayez dans quelques instants.",
            )

        except HTTPException:
            raise
        except httpx.TimeoutException:
            logger.error("Extract-profile timeout for file: %s", filename)
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="L'import du CV a pris trop de temps. Réessayez.",
            )
        except httpx.HTTPError as e:
            logger.error("Extract-profile service error: %s", e)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Service d'import indisponible",
            )


# Global instance (singleton pattern)
parser_client = ParserClient()
