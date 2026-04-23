import os
from contextlib import asynccontextmanager

import cognee
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import documents, query

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Configure Cognee from environment before the server starts accepting requests
    llm_config = {
        "provider": os.getenv("LLM_PROVIDER", "openai"),
        "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
        "api_key": os.getenv("LLM_API_KEY", ""),
    }
    embedding_config = {
        "provider": os.getenv("EMBEDDING_PROVIDER", "openai"),
        "model": os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
        "dimensions": int(os.getenv("EMBEDDING_DIMENSIONS", "1536")),
        "api_key": os.getenv("LLM_API_KEY", ""),
    }

    cognee.config.set_llm_config(llm_config)
    cognee.config.set_embedding_config(embedding_config)

    yield


app = FastAPI(title="Legacy Whisperer — Knowledge API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:5174",   # Vite alternate port
        "http://localhost:8501",   # Streamlit
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(query.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
