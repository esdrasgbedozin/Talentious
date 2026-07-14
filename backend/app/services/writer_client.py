"""
Writer Client Service
HTTP client for communicating with the Rédacteur-CV microservice
"""

import os
import logging

import httpx
from fastapi import HTTPException, status

from app.services import iam_auth

logger = logging.getLogger(__name__)

# Configuration
WRITER_SERVICE_URL = os.getenv("WRITER_SERVICE_URL", "http://redacteur-cv:8003")
REQUEST_TIMEOUT = (
    600.0  # 10 minutes for AI CV generation (can be slow with detailed profiles)
)


class WriterClient:
    """
    Async HTTP client for the Rédacteur-CV microservice
    """

    def __init__(self):
        """Initialize the Writer client"""
        self.base_url = WRITER_SERVICE_URL.rstrip("/")
        self.timeout = httpx.Timeout(REQUEST_TIMEOUT)
        logger.info(f"Writer client initialized with base URL: {self.base_url}")

    async def generate_cv(self, user_profile: dict, offer_analysis: dict) -> dict:
        """
        Generate an optimized CV based on user profile and job offer analysis

        Args:
            user_profile: User's complete profile data (experiences, skills, education, etc.)
            offer_analysis: Structured job offer analysis from Analyseur-Offre

        Returns:
            dict: Generated CV data with optimized content

        Raises:
            HTTPException: If the request fails or the service is unavailable
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                logger.info(f"Calling Rédacteur-CV to generate CV...")

                # Prepare the request payload exactly as redacteur-cv expects
                payload = {
                    "user_profile": user_profile,
                    "offer_analysis": offer_analysis,
                }
                headers = await iam_auth.auth_headers(self.base_url)

                response = await client.post(
                    f"{self.base_url}/generate",
                    json=payload,
                    headers=headers,
                )

                # Check for HTTP errors
                if response.status_code != 200:
                    error_detail = response.text
                    logger.error(
                        f"Rédacteur-CV returned status {response.status_code}: {error_detail}"
                    )
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"CV generation service error: {error_detail}",
                    )

                # Parse and return the response
                result = response.json()
                logger.info("✅ CV generated successfully by Rédacteur-CV")

                return result

        except httpx.TimeoutException as e:
            logger.error(f"Timeout while generating CV: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="CV generation timed out. The profile may be too complex or the service is overloaded.",
            )
        except httpx.RequestError as e:
            logger.error(f"Request error while generating CV: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"CV generation service unavailable: {str(e)}",
            )
        except HTTPException:
            # Re-raise HTTPExceptions as-is
            raise
        except Exception as e:
            logger.error(f"Unexpected error during CV generation: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"CV generation failed: {str(e)}",
            )

    async def health_check(self) -> bool:
        """
        Check if the Rédacteur-CV service is healthy

        Returns:
            bool: True if service is healthy, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                headers = await iam_auth.auth_headers(self.base_url)
                response = await client.get(f"{self.base_url}/health", headers=headers)
                return response.status_code == 200
        except Exception as e:
            logger.warning(f"Rédacteur-CV health check failed: {str(e)}")
            return False


# Singleton instance
writer_client = WriterClient()
