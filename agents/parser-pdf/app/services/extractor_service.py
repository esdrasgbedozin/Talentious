"""
Extractor Service — structuration du texte d'un CV en ProfileData via Vertex AI.

Même patron que l'analyseur d'offres (vertexai + to_thread + JSON forcé +
retries), avec les défenses propres à une entrée non fiable :
- le texte du document est neutralisé (clôtures <document> internes retirées)
  puis injecté par .replace (jamais str.format : un CV peut contenir { }) ;
- la sortie passe TOUJOURS par coerce_profile (liste blanche stricte) — voir
  profile_coercion.py ;
- température basse (extraction, pas de créativité).
"""

import asyncio
import json
import logging
import os
from typing import Optional

import vertexai
from vertexai.generative_models import GenerationConfig, GenerativeModel

from app.services.profile_coercion import coerce_profile, neutralize_fences

logger = logging.getLogger(__name__)

GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")
GCP_LOCATION = os.getenv("GCP_LOCATION", "europe-west9")
MODEL_NAME = os.getenv("VERTEX_AI_MODEL", "gemini-2.5-flash")


class ExtractorService:
    """Appel Vertex AI pour structurer un texte de CV en ProfileData."""

    def __init__(self):
        self.project_id = GCP_PROJECT_ID
        self.location = GCP_LOCATION
        self.model_name = MODEL_NAME
        self.model: Optional[GenerativeModel] = None

        if not self.project_id:
            logger.warning("GCP_PROJECT_ID not set - profile extraction will not work")
        else:
            self._initialize()

    def _initialize(self):
        vertexai.init(project=self.project_id, location=self.location)
        self.model = GenerativeModel(self.model_name)
        logger.info(
            "Extractor initialized: project=%s, location=%s, model=%s",
            self.project_id,
            self.location,
            self.model_name,
        )

    async def extract_profile(
        self,
        document_text: str,
        prompt_template: str,
        temperature: float = 0.1,
        max_output_tokens: int = 8192,
        max_retries: int = 2,
    ) -> tuple[dict, list]:
        """Structure le texte d'un CV en ProfileData canonique.

        Returns:
            (profile_data, warnings) — toujours passés par coerce_profile.

        Raises:
            ValueError: modèle non initialisé ou échec après retries.
        """
        if not self.model:
            raise ValueError("Vertex AI model not initialized")

        safe_text = neutralize_fences(document_text)
        prompt = prompt_template.replace("{document_text}", safe_text)

        logger.info("Extracting profile (text length: %d chars)", len(document_text))

        generation_config = GenerationConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            response_mime_type="application/json",
        )

        last_error: Optional[Exception] = None
        for attempt in range(1, max_retries + 1):
            try:
                response = await asyncio.to_thread(
                    self.model.generate_content,
                    prompt,
                    generation_config=generation_config,
                )
                raw = json.loads(response.text.strip())
                profile, warnings = coerce_profile(raw)
                logger.info(
                    "Profile extracted on attempt %d (%d experiences, %d skills)",
                    attempt,
                    len(profile["experiences"]),
                    len(profile["skills"]["hard"]) + len(profile["skills"]["soft"]),
                )
                return profile, warnings
            except json.JSONDecodeError as e:
                last_error = e
                logger.warning(
                    "Attempt %d/%d: invalid JSON from model (%s)",
                    attempt,
                    max_retries,
                    e,
                )
            except Exception as e:  # erreurs API/réseau Vertex
                last_error = e
                logger.error(
                    "Attempt %d/%d: Vertex AI error: %s", attempt, max_retries, e
                )

        raise ValueError(
            f"Profile extraction failed after {max_retries} attempts: {last_error}"
        )


# Singleton (même patron que les autres agents)
extractor_service = ExtractorService()
