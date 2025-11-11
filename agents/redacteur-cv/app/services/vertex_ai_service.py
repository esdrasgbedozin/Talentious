"""
Vertex AI Service for CV Generation
Service for generating optimized CVs using Google Vertex AI (Gemini 2.5 Flash)
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
    Service for interacting with Google Vertex AI for CV generation
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
                f"Vertex AI initialized successfully - "
                f"Project: {self.project_id}, Location: {self.location}, Model: {self.model_name}"
            )
        except Exception as e:
            logger.error(f"Failed to initialize Vertex AI: {str(e)}")
            raise
    
    def generate_cv(
        self, 
        prompt: str,
        offer_analysis: Dict[str, Any],
        user_profile: Dict[str, Any],
        temperature: float = 0.3,
        max_tokens: int = 4096
    ) -> Dict[str, Any]:
        """
        Generate optimized CV using Vertex AI Gemini
        
        Args:
            prompt: System prompt with instructions for CV generation
            offer_analysis: Job offer analysis data (from Analyseur-Offre)
            user_profile: User profile data
            temperature: Creativity level (0.0-1.0). Lower = more deterministic
            max_tokens: Maximum tokens in response
            
        Returns:
            Dict containing the generated CV data in JSON format
            
        Raises:
            Exception: If generation fails
        """
        if not self.model:
            raise Exception("Vertex AI model not initialized. Check GCP_PROJECT_ID configuration.")
        
        try:
            # Prepare the full prompt with context
            full_prompt = self._build_full_prompt(prompt, offer_analysis, user_profile)
            
            logger.info(f"Generating CV with Gemini {self.model_name} (temperature={temperature})")
            logger.debug(f"Prompt length: {len(full_prompt)} characters")
            
            # Configure generation parameters
            generation_config = GenerationConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                response_mime_type="application/json"  # Force JSON output
            )
            
            # Generate content
            response = self.model.generate_content(
                full_prompt,
                generation_config=generation_config
            )
            
            # Parse JSON response
            cv_data = json.loads(response.text)
            
            logger.info("CV generated successfully")
            logger.debug(f"Response length: {len(response.text)} characters")
            
            return cv_data
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response as JSON: {str(e)}")
            logger.error(f"Raw response: {response.text[:500]}...")
            raise Exception(f"Invalid JSON response from Gemini: {str(e)}")
        except Exception as e:
            logger.error(f"Failed to generate CV: {str(e)}")
            raise Exception(f"CV generation failed: {str(e)}")
    
    def _build_full_prompt(
        self, 
        system_prompt: str,
        offer_analysis: Dict[str, Any],
        user_profile: Dict[str, Any]
    ) -> str:
        """
        Build the complete prompt with system instructions and data
        
        Args:
            system_prompt: Instructions for the AI
            offer_analysis: Job offer analysis
            user_profile: User profile data
            
        Returns:
            Complete formatted prompt
        """
        return f"""{system_prompt}

===== JOB OFFER ANALYSIS =====
{json.dumps(offer_analysis, indent=2, ensure_ascii=False)}

===== USER PROFILE DATA =====
{json.dumps(user_profile, indent=2, ensure_ascii=False)}

===== YOUR TASK =====
Generate an optimized CV in JSON format that perfectly matches the job offer requirements.
Follow the instructions above strictly and output ONLY valid JSON.
"""
