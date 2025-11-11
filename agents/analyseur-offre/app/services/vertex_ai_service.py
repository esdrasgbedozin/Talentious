"""
Vertex AI Service
Service for analyzing job offers using Google Vertex AI (Gemini Pro)
"""

import os
import json
import logging
from typing import Dict, Any, Optional

from google.cloud import aiplatform
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
            logger.warning("GCP_PROJECT_ID not set - Vertex AI will not work in production")
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
        max_output_tokens: int = 4096  # Increased from 2048 for longer responses
    ) -> Dict[str, Any]:
        """
        Analyze a job offer using Vertex AI
        
        Args:
            job_offer_text: The job offer text to analyze
            prompt_template: The prompt template with {job_offer_text} placeholder
            temperature: Model temperature (0.0-1.0, lower = more deterministic)
            max_output_tokens: Maximum tokens in response
            
        Returns:
            Parsed JSON response from the model
            
        Raises:
            ValueError: If model not initialized or response invalid
        """
        if not self.model:
            raise ValueError("Vertex AI model not initialized")
        
        # Format the prompt with the job offer text
        prompt = prompt_template.format(job_offer_text=job_offer_text)
        
        logger.info(f"Analyzing job offer with Vertex AI (text length: {len(job_offer_text)} chars)")
        
        try:
            # Configure generation parameters
            generation_config = GenerationConfig(
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                response_mime_type="application/json"  # Force JSON response
            )
            
            # Generate content
            response = self.model.generate_content(
                prompt,
                generation_config=generation_config
            )
            
            # Extract and parse the response
            response_text = response.text.strip()
            logger.debug(f"Raw response from Vertex AI: {response_text[:200]}...")
            
            # Parse JSON response
            try:
                result = json.loads(response_text)
                logger.info("Job offer analyzed successfully")
                return result
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON response: {str(e)}")
                logger.error(f"Raw response: {response_text}")
                raise ValueError(f"Model returned invalid JSON: {str(e)}")
            
        except Exception as e:
            logger.error(f"Error calling Vertex AI: {str(e)}")
            raise ValueError(f"Failed to analyze job offer: {str(e)}")


# Global instance (singleton pattern)
vertex_ai_service = VertexAIService()
