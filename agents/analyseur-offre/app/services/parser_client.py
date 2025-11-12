"""
Parser Client Service
HTTP client for communicating with the Parser-PDF microservice
"""

import os
import logging

import httpx
from fastapi import UploadFile, HTTPException, status

logger = logging.getLogger(__name__)

# Configuration
PARSER_SERVICE_URL = os.getenv("PARSER_SERVICE_URL", "http://parser-pdf:8001")
REQUEST_TIMEOUT = 60.0  # 60 seconds for PDF processing


class ParserClient:
    """
    Async HTTP client for the Parser-PDF microservice
    """
    
    def __init__(self):
        """Initialize the Parser client"""
        self.base_url = PARSER_SERVICE_URL.rstrip("/")
        self.timeout = httpx.Timeout(REQUEST_TIMEOUT)
        logger.info(f"Parser client initialized with base URL: {self.base_url}")
    
    async def parse_pdf(self, file: UploadFile) -> str:
        """
        Parse a PDF file and extract text content
        
        Args:
            file: Uploaded PDF file
            
        Returns:
            Extracted text as string
            
        Raises:
            HTTPException: If parsing fails or service is unavailable
        """
        try:
            # Read file content
            file_content = await file.read()
            await file.seek(0)  # Reset file pointer
            
            logger.info(f"Sending PDF to parser service: {file.filename} ({len(file_content)} bytes)")
            
            # Prepare multipart form data
            files = {
                "file": (file.filename, file_content, file.content_type)
            }
            
            # Send request to parser service
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/parse",
                    files=files
                )
                
                # Handle response
                if response.status_code == 200:
                    result = response.json()
                    text = result.get("text", "")
                    logger.info(
                        f"PDF parsed successfully: {result.get('page_count')} pages, "
                        f"{result.get('character_count')} characters"
                    )
                    return text
                
                # Handle parser service errors
                elif response.status_code == 400:
                    error_detail = response.json().get("detail", "Invalid PDF file")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=error_detail
                    )
                
                elif response.status_code == 422:
                    error_detail = response.json().get("detail", "PDF contains no extractable text")
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=error_detail
                    )
                
                else:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Parser service returned an error"
                    )
                    
        except HTTPException:
            # Re-raise HTTP exceptions
            raise
            
        except httpx.TimeoutException:
            logger.error(f"Parser service timeout for file: {file.filename}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="PDF parsing timed out. File may be too large or complex."
            )
            
        except httpx.HTTPError as e:
            logger.error(f"Parser service error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Parser service is unavailable"
            )
            
        except Exception as e:
            logger.error(f"Unexpected error calling parser service: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to parse PDF"
            )


# Global instance (singleton pattern)
parser_client = ParserClient()
