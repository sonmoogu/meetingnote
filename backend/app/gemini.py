import json
import logging

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger(__name__)

# 클라이언트는 모듈에 한 번만 만들어 재사용한다 (호출 도중 회수 방지)
_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


TRANSCRIBE_PROMPT = "이 녹취 음성을 들리는 그대로 한국어 텍스트로 받아쓰세요. 설명이나 머리말 없이 받아쓴 본문만 출력하세요."

CLASSIFY_PROMPT = """다음 회의 본문을 요약 / 결정사항 / 할 일 세 갈래로 나누세요.

기준:
- 요약: 회의 전체를 3~5줄로. 새로운 사실을 지어내지 말 것.
- 결정사항: 「하기로 했다 / 확정 / 승인」 처럼 합의가 끝난 것만. 논의만 하고 안 정한 것은 넣지 말 것.
- 할 일: 담당자와 기한이 드러난 것만. 담당자가 없으면 미정으로 적을 것.
- 셋 중 어디에도 안 들어가는 잡담은 버릴 것.

기한(when)은 회의에서 말한 그대로 적고 날짜로 바꾸지 마세요.

회의 본문:
"""

CLASSIFY_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary": {"type": "STRING"},
        "decisions": {"type": "ARRAY", "items": {"type": "STRING"}},
        "todos": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "what": {"type": "STRING"},
                    "who": {"type": "STRING"},
                    "when": {"type": "STRING"},
                },
                "required": ["what", "who", "when"],
            },
        },
    },
    "required": ["summary", "decisions", "todos"],
}


def transcribe(data: bytes, mime_type: str) -> str:
    """녹취 파일을 본문 텍스트로 바꾼다. 실패하면 예외를 그대로 올린다."""
    response = get_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=[types.Part.from_bytes(data=data, mime_type=mime_type), TRANSCRIBE_PROMPT],
    )
    return (response.text or "").strip()


def _clean(text: str) -> str:
    return " ".join(str(text).replace("|", "/").split())


def classify(body: str) -> dict[str, str]:
    """본문을 세 갈래로 나눈다. 실패하면 빈 값을 돌려주고 로그만 남긴다."""
    empty = {"summary": "", "decisions": "", "todos": ""}
    try:
        response = get_client().models.generate_content(
            model=GEMINI_MODEL,
            contents=CLASSIFY_PROMPT + body,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=CLASSIFY_SCHEMA,
            ),
        )
        data = json.loads(response.text)
        decisions = "\n".join(_clean(d) for d in data.get("decisions", []) if _clean(d))
        todo_lines = []
        for item in data.get("todos", []):
            what = _clean(item.get("what", ""))
            if not what:
                continue
            who = _clean(item.get("who", "")) or "미정"
            when = _clean(item.get("when", ""))
            todo_lines.append(f"{what} | {who} | {when}")
        return {
            "summary": str(data.get("summary", "")).strip(),
            "decisions": decisions,
            "todos": "\n".join(todo_lines),
        }
    except Exception:
        logger.exception("세 갈래 구분 실패")
        return empty
