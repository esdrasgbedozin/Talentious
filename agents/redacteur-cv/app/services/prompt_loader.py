"""
Prompt Loader Service
Loads prompts from local files or GCP Secret Manager
"""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Configuration
USE_SECRET_MANAGER = os.getenv("USE_SECRET_MANAGER", "false").lower() == "true"
PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"


class PromptLoader:
    """
    Service for loading AI prompts from local files or Secret Manager
    """
    
    def __init__(self):
        """Initialize prompt loader"""
        self.use_secret_manager = USE_SECRET_MANAGER
        self.prompts_dir = PROMPTS_DIR
        
        if self.use_secret_manager:
            logger.info("Using GCP Secret Manager for prompts")
            self._init_secret_manager()
        else:
            logger.info(f"Using local files for prompts: {self.prompts_dir}")
    
    def _init_secret_manager(self):
        """Initialize Secret Manager client (for production)"""
        try:
            from google.cloud import secretmanager
            self.secret_client = secretmanager.SecretManagerServiceClient()
            self.project_id = os.getenv("GCP_PROJECT_ID")
            logger.info("Secret Manager client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Secret Manager: {str(e)}")
            raise
    
    def load_prompt(self, prompt_name: str) -> str:
        """
        Load a prompt by name
        
        Args:
            prompt_name: Name of the prompt file (without .txt extension)
            
        Returns:
            Prompt content as string
            
        Raises:
            FileNotFoundError: If prompt file not found (local mode)
            Exception: If Secret Manager access fails (production mode)
        """
        if self.use_secret_manager:
            return self._load_from_secret_manager(prompt_name)
        else:
            return self._load_from_file(prompt_name)
    
    def _load_from_file(self, prompt_name: str) -> str:
        """Load prompt from local file"""
        file_path = self.prompts_dir / f"{prompt_name}.txt"
        
        if not file_path.exists():
            raise FileNotFoundError(f"Prompt file not found: {file_path}")
        
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
        
        logger.info(f"Loaded prompt '{prompt_name}' from file ({len(content)} chars)")
        return content
    
    def _load_from_secret_manager(self, prompt_name: str) -> str:
        """Load prompt from GCP Secret Manager (production)"""
        try:
            # Secret name format: prompts/redacteur
            secret_name = f"projects/{self.project_id}/secrets/prompt-{prompt_name}/versions/latest"
            
            response = self.secret_client.access_secret_version(request={"name": secret_name})
            content = response.payload.data.decode("UTF-8").strip()
            
            logger.info(f"Loaded prompt '{prompt_name}' from Secret Manager ({len(content)} chars)")
            return content
            
        except Exception as e:
            logger.error(f"Failed to load prompt '{prompt_name}' from Secret Manager: {str(e)}")
            raise
