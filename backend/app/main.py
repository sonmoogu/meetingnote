import logging
from datetime import date, datetime, time, timedelta

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import gemini
from app.config import MAX_UPLOAD_BYTES, ROOT_DIR
from app.database import Base, engine, get_db
from app.models import Meeting
from app.schemas import NoteIn, NoteListItem, NoteOut, TodoItem

logger = logging.getLogger(__name__)

Base.metadata.create_all(engine)

app = FastAPI(title="MeetingNote API")

ALLOWED_AUDIO = {".mp3": "audio/mpeg", ".wav": "audio/wav"}


@app.exception_handler(RequestValidationError)
async def validation_to_400(request: Request, exc: RequestValidationError):
    # 스펙 외 필드(extra_forbidden)만 422 로 남기고, 나머지 검증 실패는 400 으로 바꾼다
    errors = exc.errors()
    if errors and all(e["type"] == "extra_forbidden" for e in errors):
        return await request_validation_exception_handler(request, exc)
    detail = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in errors]
    return JSONResponse(status_code=400, content={"detail": detail})


def get_note_or_404(db: Session, note_id: int) -> Meeting:
    note = db.get(Meeting, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@app.post("/api/notes", response_model=NoteOut, status_code=201)
def create_note(payload: NoteIn, db: Session = Depends(get_db)):
    data = payload.model_dump()
    # 세 갈래 값이 안 왔을 때만 Gemini 로 구분한다 (실패하면 빈 값으로 저장)
    if not any(data[k] for k in ("summary", "decisions", "todos")):
        data.update(gemini.classify(data["body"]))
    note = Meeting(**data)
    db.add(note)
    db.commit()
    return note


@app.get("/api/notes", response_model=list[NoteListItem])
def list_notes(
    q: str | None = None,
    from_: date | None = Query(None, alias="from"),
    to: date | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(Meeting)
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        stmt = stmt.where(
            or_(Meeting.title.like(pattern, escape="\\"), Meeting.attendees.like(pattern, escape="\\"))
        )
    if from_:
        stmt = stmt.where(Meeting.met_at >= datetime.combine(from_, time.min))
    if to:
        # to 는 그날 23:59:59 까지 포함한다
        stmt = stmt.where(Meeting.met_at < datetime.combine(to + timedelta(days=1), time.min))
    stmt = stmt.order_by(Meeting.met_at.desc(), Meeting.id.desc())
    return db.scalars(stmt).all()


@app.get("/api/notes/{note_id}", response_model=NoteOut)
def get_note(note_id: int, db: Session = Depends(get_db)):
    return get_note_or_404(db, note_id)


@app.put("/api/notes/{note_id}", response_model=NoteOut)
def update_note(note_id: int, payload: NoteIn, db: Session = Depends(get_db)):
    note = get_note_or_404(db, note_id)
    # 보낸 필드만 덮어쓴다 (세 갈래를 안 보내면 기존 값 유지)
    for key in payload.model_fields_set:
        setattr(note, key, getattr(payload, key))
    db.commit()
    return note


@app.delete("/api/notes/{note_id}", status_code=204)
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = get_note_or_404(db, note_id)
    db.delete(note)
    db.commit()
    return Response(status_code=204)


@app.get("/api/todos", response_model=list[TodoItem])
def list_todos(db: Session = Depends(get_db)):
    notes = db.scalars(select(Meeting).order_by(Meeting.met_at.asc(), Meeting.id.asc())).all()
    result = []
    for note in notes:
        for line in (note.todos or "").splitlines():
            if not line.strip():
                continue
            parts = [p.strip() for p in line.split("|", 2)]
            parts += [""] * (3 - len(parts))
            result.append(
                TodoItem(
                    what=parts[0],
                    who=parts[1] or "미정",
                    when=parts[2],
                    note_id=note.id,
                    note_title=note.title,
                )
            )
    return result


@app.post("/api/upload")
def upload_audio(file: UploadFile = File(...)):
    name = (file.filename or "").lower()
    ext = name[name.rfind("."):] if "." in name else ""
    if ext not in ALLOWED_AUDIO:
        raise HTTPException(status_code=415, detail="mp3, wav 파일만 올릴 수 있습니다")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="25MB 이하 파일만 올릴 수 있습니다")
    try:
        text = gemini.transcribe(data, ALLOWED_AUDIO[ext])
    except Exception:
        logger.exception("받아쓰기 실패")
        raise HTTPException(status_code=502, detail="받아쓰기 호출에 실패했습니다")
    return {"text": text}


# 프론트는 백엔드와 같은 오리진에서 제공한다 (API 라우트 뒤에 마운트)
FRONTEND_DIR = ROOT_DIR / "frontend"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
