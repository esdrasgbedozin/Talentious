"""
Parser-PDF Agent - Main Application
Microservice for PDF text extraction using PyMuPDF
"""

import logging
from typing import Dict

import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.responses import JSONResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Parser-PDF Agent",
    description="Microservice for extracting text from PDF files",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)


@app.get("/health")
async def health_check() -> Dict[str, str]:
    """
    Health check endpoint for Cloud Run and monitoring
    """
    return {"status": "healthy", "service": "parser-pdf"}


@app.post("/parse")
async def parse_pdf(file: UploadFile = File(...)) -> JSONResponse:
    """
    Parse a PDF file and extract text content
    
    Args:
        file: Uploaded PDF file
        
    Returns:
        JSON response with extracted text and metadata
        
    Raises:
        HTTPException: If file is invalid or parsing fails
    """
    # Validate file exists
    if not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided"
        )
    
    # Validate MIME type
    if file.content_type != "application/pdf":
        logger.warning(f"Invalid file type received: {file.content_type}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Expected 'application/pdf', got '{file.content_type}'"
        )
    
    # Validate file size (max 10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB in bytes
    
    try:
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large. Maximum size is 10MB, received {file_size / 1024 / 1024:.2f}MB"
            )
        
        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty file received"
            )
        
        logger.info(f"Processing PDF file: {file.filename} ({file_size / 1024:.2f}KB)")
        
        # Parse PDF with PyMuPDF
        try:
            # Open PDF from bytes
            pdf_document = fitz.open(stream=file_content, filetype="pdf")
            
            # Extract text from all pages
            extracted_text = ""
            page_count = pdf_document.page_count
            
            for page_num in range(page_count):
                page = pdf_document[page_num]
                extracted_text += page.get_text()
            
            # Close the document
            pdf_document.close()
            
            # Clean up extracted text
            extracted_text = extracted_text.strip()
            
            if not extracted_text:
                logger.warning(f"No text extracted from PDF: {file.filename}")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="PDF file appears to be empty or contains only images/scanned content"
                )
            
            logger.info(f"Successfully extracted {len(extracted_text)} characters from {page_count} pages")
            
            # Return successful response
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content={
                    "text": extracted_text,
                    "page_count": page_count,
                    "character_count": len(extracted_text),
                    "filename": file.filename
                }
            )
            
        except fitz.fitz.FileDataError as e:
            logger.error(f"Corrupted PDF file: {file.filename} - {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Corrupted or invalid PDF file: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Error parsing PDF {file.filename}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error parsing PDF: {str(e)}"
            )
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
