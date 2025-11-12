"""
Vertex AI Service for CV Generation
Service for generating optimized CVs using Google Vertex AI (Gemini 2.5 Flash)
"""

import os
import json
import asyncio
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
    
    async def generate_cv(
        self,
        system_prompt: str,
        offer_analysis: Dict[str, Any],
        user_profile: Dict[str, Any],
        temperature: float = 0.3,
        max_output_tokens: int = 8192,
        max_retries: int = 3  # Number of retry attempts for malformed JSON
    ) -> Dict[str, Any]:
        """
        Generate an optimized CV using Vertex AI Gemini with retry logic
        
        Args:
            system_prompt: System-level instructions for CV generation
            offer_analysis: Analyzed job offer data
            user_profile: User profile data
            temperature: Creativity level (0.0-1.0, higher = more creative)
            max_output_tokens: Maximum output tokens in response
            max_retries: Maximum number of retry attempts for malformed JSON
            max_tokens: Maximum output tokens
            max_retries: Maximum number of retry attempts for malformed JSON
            
        Returns:
            Generated CV data as dictionary
            
        Raises:
            Exception: If generation fails after all retries
        """
        if not self.model:
            raise Exception("Vertex AI model not initialized")
        
        try:
            # Build the complete prompt
            full_prompt = self._build_full_prompt(system_prompt, offer_analysis, user_profile)
            
            logger.info(
                f"Generating CV with Gemini {self.model_name} "
                f"(temperature={temperature}, max_retries={max_retries})"
            )
            logger.debug(f"Prompt length: {len(full_prompt)} characters")
            
            # Retry loop with JSON validation
            for attempt in range(1, max_retries + 1):
                # Configure generation parameters
                generation_config = GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_output_tokens,
                    response_mime_type="application/json"  # Force JSON output
                )
                
                logger.info(f"Attempt {attempt}/{max_retries}: Calling Vertex AI Gemini...")
                
                # Generate content asynchronously (non-blocking)
                # Use asyncio.to_thread to run the synchronous Vertex AI call in a separate thread
                response = await asyncio.to_thread(
                    self.model.generate_content,
                    full_prompt,
                    generation_config=generation_config
                )
                
                # Parse JSON response
                try:
                    cv_data = json.loads(response.text)
                    logger.info(f"CV generated successfully on attempt {attempt}")
                    logger.debug(f"Response length: {len(response.text)} characters")
                    return cv_data
                    
                except json.JSONDecodeError as e:
                    logger.warning(
                        f"Attempt {attempt}/{max_retries}: JSON parsing failed - {str(e)}"
                    )
                    logger.debug(f"Malformed JSON response: {response.text[:500]}...")
                    
                    # If this is not the last attempt, retry
                    if attempt < max_retries:
                        logger.info(f"Retrying... ({max_retries - attempt} attempts remaining)")
                        continue
                    
                    # Last attempt failed - raise error
                    logger.error(f"All {max_retries} attempts failed. Last error: {str(e)}")
                    logger.error(f"Last malformed response: {response.text[:1000]}...")
                    raise Exception(
                        f"Gemini returned invalid JSON after {max_retries} attempts. "
                        f"Last error: {str(e)}"
                    )
                    
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
