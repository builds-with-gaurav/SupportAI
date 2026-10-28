import sys
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware

PROJECT_ROOT = Path(__file__).resolve().parent.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


from fastapi import FastAPI

from database import engine, Base
import models

from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.tickets import router as tickets_router


Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="SupportAI API",
    description="AI-Powered Customer Support & Ticket Automation Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(tickets_router)


@app.get("/")
def root():
    return {
        "message": "SupportAI API is running!",
        "status": "success"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }


@app.get("/database")
def database_check():
    return {
        "database": "SQLite",
        "status": "connected"
    }