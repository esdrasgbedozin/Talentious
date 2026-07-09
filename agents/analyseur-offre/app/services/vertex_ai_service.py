"""
Vertex AI Service
Service for analyzing job offers using Google Vertex AI (Gemini Pro)
"""

import asyncio
import os
import json
import logging
from typing import Dict, Any, Optional

from vertexai.generative_models import GenerativeModel, GenerationConfig
import vertexai

logger = logging.getLogger(__name__)

# Configuration
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")
# europe-west9 (Paris) - Souveraineté des données française/EU (RGPD)
# Gemini 2.5 Flash: 1M token context window (~750K chars), optimized for speed
GCP_LOCATION = os.getenv("GCP_LOCATION", "europe-west9")
MODEL_NAME = os.getenv("VERTEX_AI_MODEL", "gemini-2.5-flash")


class VertexAIService:
    """
    Service for interacting with Google Vertex AI
    """

    def __init__(self):
        """Initialize Vertex AI service"""
        self.project_id = GCP_PROJECT_ID
        self.location = GCP_LOCATION
        self.model_name = MODEL_NAME
        self.model: Optional[GenerativeModel] = None

        if not self.project_id:
            logger.warning(
                "GCP_PROJECT_ID not set - Vertex AI will not work in production"
            )
        else:
            self._initialize_vertex_ai()

    def _initialize_vertex_ai(self):
        """Initialize Vertex AI SDK"""
        try:
            # Initialize Vertex AI
            vertexai.init(project=self.project_id, location=self.location)

            # Initialize the model
            self.model = GenerativeModel(self.model_name)

            logger.info(
                f"Vertex AI initialized: "
                f"project={self.project_id}, "
                f"location={self.location}, "
                f"model={self.model_name}"
            )
        except Exception as e:
            logger.error(f"Failed to initialize Vertex AI: {str(e)}")
            raise

    async def analyze_job_offer(
        self,
        job_offer_text: str,
        prompt_template: str,
        temperature: float = 0.2,
        max_output_tokens: int = 8192,  # Increased from 4096 to handle detailed job offers with many skills
        max_retries: int = 3,  # Number of retry attempts for malformed JSON
    ) -> Dict[str, Any]:
        """
        Analyze a job offer using Vertex AI with retry logic for JSON validation

        Args:
            job_offer_text: The job offer text to analyze
            prompt_template: The prompt template with {job_offer_text} placeholder
            temperature: Model temperature (0.0-1.0, lower = more deterministic)
            max_output_tokens: Maximum tokens in response
            max_retries: Maximum number of retry attempts for malformed JSON

        Returns:
            Parsed JSON response from the model

        Raises:
            ValueError: If model not initialized or all retries fail
        """
        if not self.model:
            raise ValueError("Vertex AI model not initialized")

        # Format the prompt with the job offer text
        prompt = prompt_template.format(job_offer_text=job_offer_text)

        logger.info(
            f"Analyzing job offer with Vertex AI "
            f"(text length: {len(job_offer_text)} chars, max_retries: {max_retries})"
        )

        # Retry loop with JSON validation
        for attempt in range(1, max_retries + 1):
            try:
                # Configure generation parameters
                generation_config = GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_output_tokens,
                    response_mime_type="application/json",  # Force JSON response
                )

                logger.info(f"Attempt {attempt}/{max_retries}: Calling Vertex AI...")

                # Generate content off the event loop (the Vertex SDK call is blocking).
                response = await asyncio.to_thread(
                    self.model.generate_content,
                    prompt,
                    generation_config=generation_config,
                )

                # Extract and parse the response
                response_text = response.text.strip()
                logger.debug(
                    f"Raw response from Vertex AI (attempt {attempt}): {response_text[:200]}..."
                )

                # Parse JSON response
                try:
                    result = json.loads(response_text)
                    logger.info(
                        f"✅ Job offer analyzed successfully on attempt {attempt}"
                    )
                    return result

                except json.JSONDecodeError as e:
                    logger.warning(
                        f"⚠️  Attempt {attempt}/{max_retries}: JSON parsing failed - {str(e)}"
                    )
                    logger.debug(f"Malformed JSON response: {response_text}")

                    # If this is not the last attempt, retry
                    if attempt < max_retries:
                        logger.info(
                            f"🔄 Retrying... ({max_retries - attempt} attempts remaining)"
                        )
                        continue

                    # Last attempt failed - raise error
                    logger.error(
                        f"❌ All {max_retries} attempts failed. Last error: {str(e)}"
                    )
                    logger.error(f"Last malformed response: {response_text}")
                    raise ValueError(
                        f"Model returned invalid JSON after {max_retries} attempts. "
                        f"Last error: {str(e)}"
                    )

            except Exception as e:
                # Non-JSON errors (network, API errors, etc.)
                if "invalid JSON" not in str(e):
                    logger.error(
                        f"❌ Error calling Vertex AI on attempt {attempt}: {str(e)}"
                    )
                    raise ValueError(f"Failed to analyze job offer: {str(e)}")
                raise  # Re-raise JSON errors to be handled by outer try/except


# Global instance (singleton pattern)
vertex_ai_service = VertexAIService()
