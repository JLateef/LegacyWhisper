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
    # Cognee config uses individual setters (not a dict with "provider")
    cognee.config.set_llm_provider(os.getenv("LLM_PROVIDER", "openai"))
    cognee.config.set_llm_model(os.getenv("LLM_MODEL", "gpt-4o-mini"))
    cognee.config.set_llm_api_key(os.getenv("LLM_API_KEY", ""))

    cognee.config.set_embedding_provider(os.getenv("EMBEDDING_PROVIDER", "openai"))
    cognee.config.set_embedding_model(os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"))
    cognee.config.set_embedding_api_key(os.getenv("LLM_API_KEY", ""))

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
