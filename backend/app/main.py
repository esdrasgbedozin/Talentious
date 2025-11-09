from fastapi import FastAPI

app = FastAPI(title="Talentious API")

@app.get("/")
def root():
    """Root endpoint."""
    return {
        "message": "Welcome to Talentious API",
        "version": "0.1.0",
        "docs": "/docs"
    }

@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
