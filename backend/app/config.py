import os
from pathlib import Path

from dotenv import load_dotenv

# 프로젝트 루트의 .env 에서만 설정을 읽는다
ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

DATABASE_URL = f"sqlite:///{Path(__file__).resolve().parents[1] / 'meetingnote.db'}"

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
