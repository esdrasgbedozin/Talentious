"""
Analyzer Client Service
HTTP client for communicating with the Analyseur-Offre microservice
"""

import os
import logging
from typing import Dict, Any, List

import httpx
from fastapi import UploadFile, HTTPException, status

logger = logging.getLogger(__name__)

# Configuration
ANALYZER_SERVICE_URL = os.getenv("ANALYZER_SERVICE_URL", "http://analyseur-offre:8002")
REQUEST_TIMEOUT = 120.0  # 2 minutes for AI processing


class SkillItem:
    """Individual skill item from analysis"""
    
    def __init__(self, name: str, level: str = None, importance: str = None):
        self.name = name
        self.level = level
        self.importance = importance
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        result = {"name": self.name}
        if self.level:
            result["level"] = self.level
        if self.importance:
            result["importance"] = self.importance
        return result


class AnalysisResult:
    """Structured result from job offer analysis"""
    
    def __init__(
        self,
        hard_skills: List[Dict[str, Any]],
        soft_skills: List[Dict[str, Any]],  # Now accepts SkillItem structure
        seniority_level: str,
        key_responsibilities: List[str],
        tone: str
    ):
        self.hard_skills = [SkillItem(**skill) for skill in hard_skills]
        self.soft_skills = [SkillItem(**skill) for skill in soft_skills]
        self.seniority_level = seniority_level
        self.key_responsibilities = key_responsibilities
        self.tone = tone
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "hard_skills": [skill.to_dict() for skill in self.hard_skills],
            "soft_skills": [skill.to_dict() for skill in self.soft_skills],
            "seniority_level": self.seniority_level,
            "key_responsibilities": self.key_responsibilities,
            "tone": self.tone
        }


class AnalyzerClient:
    """
    Async HTTP client for the Analyseur-Offre microservice
    """
    
    def __init__(self):
        """Initialize the Analyzer client"""
        self.base_url = ANALYZER_SERVICE_URL.rstrip("/")
        self.timeout = httpx.Timeout(REQUEST_TIMEOUT)
        logger.info(f"Analyzer client initialized with base URL: {self.base_url}")
    
    async def analyze_text(self, text: str) -> AnalysisResult:
        """
        Analyze a job offer from plain text
        
        Args:
            text: Job offer text (50-200,000 characters)
            
        Returns:
            AnalysisResult with structured job offer data
            
        Raises:
            HTTPException: If analysis fails or service is unavailable
        """
        try:
            logger.info(f"Sending job offer text to analyzer service ({len(text)} characters)")
            
            # Prepare request
            payload = {"text": text}
            
            # Send request to analyzer service
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/analyze",
                    json=payload
                )
                
                # Handle response
                if response.status_code == 200:
                    result = response.json()
                    logger.info("Job offer analyzed successfully")
                    return AnalysisResult(**result)
                
                # Handle analyzer service errors
                elif response.status_code == 400:
                    error_detail = response.json().get("detail", "Invalid job offer text")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=error_detail
                    )
                
                elif response.status_code == 422:
                    error_detail = response.json().get("detail", "Failed to process job offer")
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=error_detail
                    )
                
                else:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Analyzer service returned an error"
                    )
                    
        except HTTPException:
            # Re-raise HTTP exceptions
            raise
            
        except httpx.TimeoutException:
            logger.error("Analyzer service timeout")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Job offer analysis timed out. Please try again."
            )
            
        except httpx.HTTPError as e:
            logger.error(f"Analyzer service error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Analyzer service is unavailable"
            )
            
        except Exception as e:
            logger.error(f"Unexpected error calling analyzer service: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to analyze job offer"
            )
    
    async def analyze_pdf(self, file: UploadFile) -> AnalysisResult:
        """
        Analyze a job offer from a PDF file
        
        Args:
            file: Uploaded PDF file
            
        Returns:
            AnalysisResult with structured job offer data
            
        Raises:
            HTTPException: If analysis fails or service is unavailable
        """
        try:
            # Read file content
            file_content = await file.read()
            await file.seek(0)  # Reset file pointer
            
            logger.info(f"Sending PDF to analyzer service: {file.filename} ({len(file_content)} bytes)")
            
            # Prepare multipart form data
            files = {
                "file": (file.filename, file_content, file.content_type)
            }
            
            # Send request to analyzer service
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/analyze/pdf",
                    files=files
                )
                
                # Handle response
                if response.status_code == 200:
                    result = response.json()
                    logger.info("PDF job offer analyzed successfully")
                    return AnalysisResult(**result)
                
                # Handle analyzer service errors
                elif response.status_code == 400:
                    error_detail = response.json().get("detail", "Invalid PDF file")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=error_detail
                    )
                
                elif response.status_code == 422:
                    error_detail = response.json().get("detail", "Failed to process PDF")
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=error_detail
                    )
                
                elif response.status_code == 503:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="PDF parser service is unavailable"
                    )
                
                else:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Analyzer service returned an error"
                    )
                    
        except HTTPException:
            # Re-raise HTTP exceptions
            raise
            
        except httpx.TimeoutException:
            logger.error(f"Analyzer service timeout for file: {file.filename}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="PDF analysis timed out. File may be too large or complex."
            )
            
        except httpx.HTTPError as e:
            logger.error(f"Analyzer service error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Analyzer service is unavailable"
            )
            
        except Exception as e:
            logger.error(f"Unexpected error calling analyzer service: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to analyze PDF job offer"
            )


# Global instance (singleton pattern)
analyzer_client = AnalyzerClient()
