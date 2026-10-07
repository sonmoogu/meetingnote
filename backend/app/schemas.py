from datetime import datetime, timezone
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_serializer, field_validator

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def to_utc_naive(value: datetime) -> datetime:
    # 시간대가 없으면 UTC 로 본다. 있으면 UTC 로 바꾼 뒤 시간대 정보를 뗀다
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def to_utc_iso(value: datetime) -> str:
    return value.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


class NoteIn(BaseModel):
    # 스펙 외 필드는 조용히 무시하지 않고 422 로 거절한다
    model_config = ConfigDict(extra="forbid")

    title: Title
    met_at: datetime
    attendees: str | None = None
    body: Body
    summary: str | None = None
    decisions: str | None = None
    todos: str | None = None

    @field_validator("met_at")
    @classmethod
    def _met_at_to_utc(cls, value: datetime) -> datetime:
        return to_utc_naive(value)


class NoteListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    met_at: datetime
    attendees: str | None
    summary: str | None
    decisions: str | None
    todos: str | None

    @field_serializer("met_at")
    def _ser_met_at(self, value: datetime) -> str:
        return to_utc_iso(value)


class NoteOut(NoteListItem):
    body: str


class TodoItem(BaseModel):
    what: str
    who: str
    when: str
    note_id: int
    note_title: str
