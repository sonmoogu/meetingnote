import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

SAMPLE_BODY = (
    "오늘 기획 회의에서 신규 앱 출시일을 다음 달 10일로 확정했습니다. "
    "디자인 시안은 김대리가 다음 주 금요일까지 전달하기로 했습니다. "
    "마케팅 예산은 아직 논의만 했고 정하지 못했습니다. 점심 메뉴 얘기도 잠깐 나왔습니다."
)


@pytest.fixture()
def client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def create_note(client):
    def _create(**overrides):
        payload = {
            "title": "기획 회의",
            "met_at": "2025-03-04T01:00:00Z",
            "attendees": "김대리, 이주임",
            "body": SAMPLE_BODY,
        }
        payload.update(overrides)
        response = client.post("/api/notes", json=payload)
        # 실제 Gemini 를 부르므로 한도에 걸리지 않게 호출 사이를 띄운다
        time.sleep(1)
        return response

    return _create
