"""
Rédacteur-CV Agent - FastAPI Microservice
Generates optimized CVs by combining user profiles with job offer analysis
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models import GenerateRequest, GenerateResponse, GeneratedCVData
from app.services.vertex_ai_service import VertexAIService
from app.services.prompt_loader import PromptLoader

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global instances
vertex_service: VertexAIService
prompt_loader: PromptLoader


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events
    """
    # Startup
    global vertex_service, prompt_loader

    logger.info("🚀 Starting Rédacteur-CV Agent...")

    try:
        # Initialize services
        vertex_service = VertexAIService()
        prompt_loader = PromptLoader()

        # Load and cache the prompt
        redacteur_prompt = prompt_loader.load_prompt("redacteur")
        logger.info(f"✅ Rédacteur prompt loaded: {len(redacteur_prompt)} characters")

        logger.info("✅ Rédacteur-CV Agent ready!")

    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {str(e)}")
        raise

    yield

    # Shutdown
    logger.info("🛑 Shutting down Rédacteur-CV Agent...")


# Create FastAPI app
app = FastAPI(
    title="Rédacteur-CV Agent",
    description="AI-powered CV optimization service using Vertex AI Gemini 2.5 Flash",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    # Private microservice (called by the backend via IAM, never a browser):
    # no cross-origin access needed. "*" + credentials is invalid and unsafe.
    allow_origins=[],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """
    Health check endpoint
    Returns service status and configuration
    """
    return {
        "status": "healthy",
        "service": "redacteur-cv",
        "version": "1.0.0",
        "vertex_ai": {
            "project_id": vertex_service.project_id or "Not configured",
            "location": vertex_service.location,
            "model": vertex_service.model_name,
        },
    }


@app.post("/generate", response_model=GenerateResponse)
async def generate_cv(request: GenerateRequest):
    """
    Generate an optimized CV tailored to a specific job offer

    This endpoint combines:
    - Job offer analysis (from Analyseur-Offre agent)
    - User profile data (from backend)

    And produces an optimized CV in JSON format ready for rendering.

    Args:
        request: GenerateRequest containing offer_analysis and user_profile

    Returns:
        GenerateResponse with optimized cv_data

    Raises:
        HTTPException: If generation fails
    """
    try:
        logger.info("📝 Starting CV generation...")
        # Do not log PII (email/name) — RGPD data minimization.
        logger.info(f"   Job seniority: {request.offer_analysis.seniority_level}")
        logger.info(
            f"   Critical skills: {sum(1 for s in request.offer_analysis.hard_skills + request.offer_analysis.soft_skills if s.importance == 'Critical')}"
        )

        # Load the prompt
        redacteur_prompt = prompt_loader.load_prompt("redacteur")

        # Convert Pydantic models to dicts for JSON serialization
        offer_analysis_dict = request.offer_analysis.model_dump()
        user_profile_dict = request.user_profile.model_dump()

        # Generate CV with Vertex AI (async - non-blocking)
        cv_data_dict = await vertex_service.generate_cv(
            system_prompt=redacteur_prompt,  # Changed from 'prompt' to 'system_prompt'
            offer_analysis=offer_analysis_dict,
            user_profile=user_profile_dict,
            temperature=0.3,  # Low temperature for consistent, professional output
            max_output_tokens=8192,  # Increased from 4096 to handle large CVs with extensive experience
        )

        # Validate the response structure with Pydantic
        cv_data = GeneratedCVData(**cv_data_dict)

        logger.info("✅ CV generated successfully!")
        logger.info(f"   Experiences selected: {len(cv_data.selected_experiences)}")
        logger.info(f"   Skills highlighted: {len(cv_data.highlighted_skills)}")
        logger.info(f"   Summary length: {len(cv_data.summary)} characters")

        return GenerateResponse(cv_data=cv_data, message="CV generated successfully")

    except ValueError as e:
        # Pydantic validation error
        logger.error(f"Invalid CV data structure: {str(e)}")
        raise HTTPException(
            status_code=422, detail=f"Generated CV data validation failed: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Failed to generate CV: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate CV: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8003)
