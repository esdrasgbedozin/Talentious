"""
Analyseur-Offre Microservice
FastAPI application for analyzing job offers using Vertex AI
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware

from app.models import AnalyzeRequest, AnalysisResult, HealthResponse, ErrorResponse
from app.services import prompt_loader, parser_client, vertex_ai_service

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Service metadata
SERVICE_NAME = "analyseur-offre"
SERVICE_VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info(f"Starting {SERVICE_NAME} v{SERVICE_VERSION}")
    yield
    logger.info(f"Shutting down {SERVICE_NAME}")


# Create FastAPI application
app = FastAPI(
    title="Analyseur-Offre Microservice",
    description="Microservice for analyzing job offers using Vertex AI (Gemini Pro)",
    version=SERVICE_VERSION,
    lifespan=lifespan,
)

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    # Private microservice (called by the backend via IAM, never a browser):
    # no cross-origin access needed. "*" + credentials is invalid and unsafe.
    allow_origins=[],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint
    """
    return HealthResponse(
        status="healthy", service=SERVICE_NAME, version=SERVICE_VERSION
    )


@app.post(
    "/analyze",
    response_model=AnalysisResult,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid input"},
        422: {"model": ErrorResponse, "description": "Processing error"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    tags=["Analysis"],
)
async def analyze_text(request: AnalyzeRequest):
    """
    Analyze a job offer from plain text

    This endpoint accepts job offer text directly and analyzes it using Vertex AI
    to extract:
    - Hard skills (technical skills with optional levels and importance)
    - Soft skills (behavioral skills with optional importance)
    - Seniority level (Junior, Mid-level, Senior, Lead)
    - Key responsibilities
    - Overall tone

    The text must be between 50 and 200,000 characters.
    Gemini 1.5 Flash has a 1M token context window (~750K chars), so we support
    even extremely long job postings or combined documents.
    """
    try:
        logger.info(f"Analyzing job offer text ({len(request.text)} characters)")

        # Load the prompt template
        prompt_template = prompt_loader.load_prompt("analyseur")

        # Analyze the job offer with Vertex AI
        result = await vertex_ai_service.analyze_job_offer(
            job_offer_text=request.text, prompt_template=prompt_template
        )

        # Validate and return the result
        return AnalysisResult(**result)

    except ValueError as e:
        logger.error(f"Analysis error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to analyze job offer",
        )


@app.post(
    "/analyze/pdf",
    response_model=AnalysisResult,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid PDF file"},
        422: {"model": ErrorResponse, "description": "Processing error"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
        503: {"model": ErrorResponse, "description": "Parser service unavailable"},
    },
    tags=["Analysis"],
)
async def analyze_pdf(
    file: UploadFile = File(..., description="PDF file containing job offer"),
):
    """
    Analyze a job offer from a PDF file

    This endpoint accepts a PDF file, extracts the text using the Parser-PDF
    microservice, and then analyzes it using Vertex AI.

    The PDF must:
    - Be a valid PDF file (application/pdf MIME type)
    - Be smaller than 10MB
    - Contain extractable text (not images only)

    Returns the same structured analysis as the /analyze endpoint.
    """
    try:
        logger.info(f"Analyzing job offer from PDF: {file.filename}")

        # Validate file type
        if file.content_type != "application/pdf":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be a PDF (application/pdf)",
            )

        # Extract text from PDF using Parser service
        job_offer_text = await parser_client.parse_pdf(file)

        # Validate extracted text length
        if len(job_offer_text) < 50:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Extracted text too short (minimum 50 characters)",
            )

        if len(job_offer_text) > 200000:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Extracted text too long (maximum 200,000 characters)",
            )

        logger.info(f"Extracted {len(job_offer_text)} characters from PDF")

        # Load the prompt template
        prompt_template = prompt_loader.load_prompt("analyseur")

        # Analyze the job offer with Vertex AI
        result = await vertex_ai_service.analyze_job_offer(
            job_offer_text=job_offer_text, prompt_template=prompt_template
        )

        # Validate and return the result
        return AnalysisResult(**result)

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except ValueError as e:
        logger.error(f"Analysis error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to analyze job offer from PDF",
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8002)
