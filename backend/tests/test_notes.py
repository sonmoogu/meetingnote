import io


def test_create_note(create_note):
    response = create_note()
    assert response.status_code == 201
    data = response.json()
    assert data["id"] >= 1
    assert data["body"]
    # 실제 Gemini 가 세 갈래로 구분했는지 확인한다
    assert data["summary"]
    assert data["decisions"]
    assert data["todos"]
    assert data["met_at"].endswith("Z")


def test_list_notes_excludes_body(create_note, client):
    create_note()
    response = client.get("/api/notes")
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert "body" not in items[0]


def test_get_note_includes_body(create_note, client):
    note_id = create_note().json()["id"]
    response = client.get(f"/api/notes/{note_id}")
    assert response.status_code == 200
    assert response.json()["body"]


def test_update_note(create_note, client):
    note_id = create_note().json()["id"]
    payload = {
        "title": "수정된 제목",
        "met_at": "2025-03-05T02:00:00+09:00",
        "attendees": "박과장",
        "body": "수정된 본문",
        "summary": "수정 요약",
        "decisions": "수정 결정",
        "todos": "수정 할 일 | 박과장 | 내일",
    }
    response = client.put(f"/api/notes/{note_id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "수정된 제목"
    assert data["met_at"] == "2025-03-04T17:00:00Z"
    assert data["todos"] == "수정 할 일 | 박과장 | 내일"


def test_delete_note(create_note, client):
    note_id = create_note().json()["id"]
    assert client.delete(f"/api/notes/{note_id}").status_code == 204
    assert client.get(f"/api/notes/{note_id}").status_code == 404
    # 지운 id 를 다시 쓰지 않는다 (AUTOINCREMENT)
    new_id = create_note().json()["id"]
    assert new_id > note_id


def test_search_title_and_attendees_only(create_note, client):
    create_note(title="기획 회의", attendees="김대리")
    create_note(title="주간 점검", attendees="기획팀 박과장")
    create_note(title="디자인 리뷰", attendees="이주임", body="기획 이라는 단어는 본문에만 있습니다.")
    response = client.get("/api/notes", params={"q": "기획"})
    assert response.status_code == 200
    titles = sorted(item["title"] for item in response.json())
    assert titles == ["기획 회의", "주간 점검"]


def test_todos(create_note, client):
    create_note()
    response = client.get("/api/todos")
    assert response.status_code == 200
    todos = response.json()
    assert todos
    assert set(todos[0]) == {"what", "who", "when", "note_id", "note_title"}


def test_missing_title_is_400(client):
    response = client.post("/api/notes", json={"met_at": "2025-03-04T01:00:00Z", "body": "본문"})
    assert response.status_code == 400


def test_invalid_met_at_is_400(client):
    response = client.post("/api/notes", json={"title": "t", "met_at": "어제쯤", "body": "본문"})
    assert response.status_code == 400


def test_unknown_id_is_404(client):
    assert client.get("/api/notes/99999").status_code == 404


def test_extra_field_is_422(client):
    payload = {"title": "t", "met_at": "2025-03-04T01:00:00Z", "body": "본문", "unknown": 1}
    assert client.post("/api/notes", json=payload).status_code == 422


def test_upload_mp4_is_415(client):
    files = {"file": ("meeting.mp4", io.BytesIO(b"x"), "video/mp4")}
    assert client.post("/api/upload", files=files).status_code == 415


def test_upload_30mb_is_413(client):
    big = io.BytesIO(b"\0" * (30 * 1024 * 1024))
    files = {"file": ("meeting.mp3", big, "audio/mpeg")}
    assert client.post("/api/upload", files=files).status_code == 413
