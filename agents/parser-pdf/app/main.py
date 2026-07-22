"""
Parser-PDF Agent - Main Application
Import de PDF : extraction de texte (PyMuPDF) et structuration en ProfileData
(Vertex AI) — voir contracts/agents/parser-pdf.openapi.yaml.
"""

import logging
from typing import Dict, Tuple

import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.responses import JSONResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Parser-PDF Agent",
    description="PDF import: text extraction and ProfileData structuring",
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Limites (contrat) : 10 Mo, 20 pages pour l'extraction structurée,
# 30 000 caractères envoyés au LLM (troncature signalée en warning).
MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_PAGES_FOR_EXTRACTION = 20
MAX_LLM_CHARS = 30_000


async def _read_and_extract_text(file: UploadFile) -> Tuple[str, int]:
    """Validations communes + extraction PyMuPDF. Retourne (texte, nb_pages).

    Raises:
        HTTPException: 400 (fichier invalide) / 422 (aucun texte) / 500.
    """
    if not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided"
        )
    if file.content_type != "application/pdf":
        logger.warning(f"Invalid file type received: {file.content_type}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Expected 'application/pdf', got '{file.content_type}'",
        )

    file_content = await file.read()
    file_size = len(file_content)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is 10MB, received {file_size / 1024 / 1024:.2f}MB",
        )
    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file received"
        )

    logger.info(f"Processing PDF file: {file.filename} ({file_size / 1024:.2f}KB)")

    try:
        pdf_document = fitz.open(stream=file_content, filetype="pdf")
    except Exception as e:
        logger.error(f"Corrupted PDF file: {file.filename} - {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Corrupted or invalid PDF file",
        )

    try:
        page_count = pdf_document.page_count
        extracted_text = "".join(
            pdf_document[i].get_text() for i in range(page_count)
        ).strip()
    finally:
        pdf_document.close()

    if not extracted_text:
        logger.warning(f"No text extracted from PDF: {file.filename}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="PDF file appears to be empty or contains only images/scanned content",
        )

    return extracted_text, page_count


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
    extracted_text, page_count = await _read_and_extract_text(file)

    logger.info(
        f"Successfully extracted {len(extracted_text)} characters from {page_count} pages"
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "text": extracted_text,
            "page_count": page_count,
            "character_count": len(extracted_text),
            "filename": file.filename,
        },
    )


@app.post("/extract-profile")
async def extract_profile(file: UploadFile = File(...)) -> JSONResponse:
    """
    Chaîne complète d'import : PDF → texte (PyMuPDF) → ProfileData (Gemini).

    Le résultat est un BROUILLON coercé au schéma canonique (liste blanche
    stricte) — jamais à persister sans relecture humaine. Voir le contrat
    contracts/agents/parser-pdf.openapi.yaml.
    """
    # Imports locaux : le module Vertex ne doit pas empêcher /parse et /health
    # de fonctionner si l'init IA échoue (dégradation partielle, pas totale).
    from app.services.extractor_service import extractor_service
    from app.services.prompt_loader import prompt_loader

    extracted_text, page_count = await _read_and_extract_text(file)

    if page_count > MAX_PAGES_FOR_EXTRACTION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many pages for extraction: {page_count} (max {MAX_PAGES_FOR_EXTRACTION})",
        )

    warnings: list = []
    if len(extracted_text) > MAX_LLM_CHARS:
        extracted_text = extracted_text[:MAX_LLM_CHARS]
        warnings.append(
            f"Texte tronqué à {MAX_LLM_CHARS} caractères ({page_count} pages)"
        )

    try:
        # Pas de kwargs à load_prompt : le template contient des accolades JSON
        # littérales ; l'injection du texte se fait par .replace dans le service.
        prompt_template = prompt_loader.load_prompt("extracteur")
    except Exception as e:
        logger.error(f"Failed to load extraction prompt: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Extraction prompt unavailable",
        )

    try:
        profile_data, extract_warnings = await extractor_service.extract_profile(
            extracted_text, prompt_template
        )
    except ValueError as e:
        logger.error(f"Profile extraction failed for {file.filename}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Profile extraction failed (AI service unavailable or invalid output)",
        )

    logger.info(
        f"Profile extracted from {file.filename}: "
        f"{len(profile_data['experiences'])} experiences, "
        f"{len(profile_data['educations'])} educations"
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"profile_data": profile_data, "warnings": warnings + extract_warnings},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
