"""
Ryzm Terminal v1.5 - Entry Point
Thin wrapper that imports the modular FastAPI app.
"""
import os
import uvicorn
from app.main import app  # noqa: F401

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))

    print("Ryzm Terminal Engine Starting...")
    print(f"  Access URL: http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)
