"""
Prompt Loader Service
Abstraction layer for loading prompts from local files or GCP Secret Manager
"""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Environment configuration
USE_SECRET_MANAGER = os.getenv("USE_SECRET_MANAGER", "false").lower() == "true"
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")
PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"


class PromptLoader:
    """
    Service for loading prompts from either local files or GCP Secret Manager
    
    In development: Loads from local files in prompts/ directory
    In production: Loads from GCP Secret Manager
    """
    
    def __init__(self):
        """Initialize the prompt loader"""
        self.use_secret_manager = USE_SECRET_MANAGER
        self.project_id = GCP_PROJECT_ID
        self.prompts_cache = {}
        
        if self.use_secret_manager:
            if not self.project_id:
                raise ValueError("GCP_PROJECT_ID must be set when USE_SECRET_MANAGER=true")
            logger.info(f"Prompt loader initialized with Secret Manager (project: {self.project_id})")
        else:
            logger.info(f"Prompt loader initialized with local files (dir: {PROMPTS_DIR})")
    
    def load_prompt(self, prompt_name: str, **kwargs) -> str:
        """
        Load a prompt by name and optionally format it with variables
        
        Args:
            prompt_name: Name of the prompt (e.g., 'analyseur')
            **kwargs: Variables to inject into the prompt template
            
        Returns:
            Formatted prompt string
            
        Raises:
            FileNotFoundError: If prompt file doesn't exist (local mode)
            ValueError: If Secret Manager access fails (production mode)
        """
        # Check cache first
        cache_key = f"{prompt_name}_{hash(frozenset(kwargs.items()))}"
        if cache_key in self.prompts_cache:
            logger.debug(f"Prompt '{prompt_name}' loaded from cache")
            return self.prompts_cache[cache_key]
        
        # Load prompt template
        if self.use_secret_manager:
            prompt_template = self._load_from_secret_manager(prompt_name)
        else:
            prompt_template = self._load_from_local_file(prompt_name)
        
        # Format with variables if provided
        if kwargs:
            try:
                formatted_prompt = prompt_template.format(**kwargs)
            except KeyError as e:
                logger.error(f"Missing variable in prompt template: {e}")
                raise ValueError(f"Prompt template requires variable: {e}")
        else:
            formatted_prompt = prompt_template
        
        # Cache the formatted prompt
        self.prompts_cache[cache_key] = formatted_prompt
        
        logger.info(f"Prompt '{prompt_name}' loaded successfully ({len(formatted_prompt)} chars)")
        return formatted_prompt
    
    def _load_from_local_file(self, prompt_name: str) -> str:
        """
        Load prompt from local file
        
        Args:
            prompt_name: Name of the prompt file (without .txt extension)
            
        Returns:
            Prompt template string
            
        Raises:
            FileNotFoundError: If prompt file doesn't exist
        """
        prompt_file = PROMPTS_DIR / f"{prompt_name}.txt"
        
        if not prompt_file.exists():
            logger.error(f"Prompt file not found: {prompt_file}")
            raise FileNotFoundError(f"Prompt file not found: {prompt_file}")
        
        try:
            with open(prompt_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            logger.debug(f"Loaded prompt from local file: {prompt_file}")
            return content
            
        except Exception as e:
            logger.error(f"Error reading prompt file {prompt_file}: {str(e)}")
            raise
    
    def _load_from_secret_manager(self, prompt_name: str) -> str:
        """
        Load prompt from GCP Secret Manager
        
        Args:
            prompt_name: Name of the secret (e.g., 'PROMPT_ANALYSEUR_OFFRE')
            
        Returns:
            Prompt template string
            
        Raises:
            ValueError: If secret access fails
        """
        try:
            from google.cloud import secretmanager
            
            # Format secret name (convention: PROMPT_<UPPERCASE_NAME>)
            secret_name = f"PROMPT_{prompt_name.upper().replace('-', '_')}"
            secret_path = f"projects/{self.project_id}/secrets/{secret_name}/versions/latest"
            
            # Create Secret Manager client
            client = secretmanager.SecretManagerServiceClient()
            
            # Access the secret
            response = client.access_secret_version(request={"name": secret_path})
            payload = response.payload.data.decode('utf-8').strip()
            
            logger.debug(f"Loaded prompt from Secret Manager: {secret_name}")
            return payload
            
        except ImportError:
            logger.error("google-cloud-secretmanager not installed")
            raise ValueError("Secret Manager dependencies not available")
        except Exception as e:
            logger.error(f"Error loading secret '{secret_name}': {str(e)}")
            raise ValueError(f"Failed to load prompt from Secret Manager: {str(e)}")
    
    def clear_cache(self):
        """Clear the prompt cache (useful for testing or prompt updates)"""
        self.prompts_cache.clear()
        logger.info("Prompt cache cleared")


# Global singleton instance
prompt_loader = PromptLoader()
