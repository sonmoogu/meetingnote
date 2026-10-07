# 04. Tasks

MeetingNote MVP 를 3개 Phase 로 진행한다. Phase 이름과 개수, 단계 수는 고정이며 변경하지 않는다.

| Phase | 이름 | 단계 수 |
|---|---|---|
| 1 | 설계 | 10 |
| 2 | 백엔드 | 10 |
| 3 | 프론트 | 8 |

## 진행 규칙

- 순서대로만 진행한다. 병렬로 진행하지 않는다.
- 단계마다 검증 방법을 실행해 확인한 뒤에 다음 단계로 간다.
- 완료한 단계는 완료 열을 `[ ]` 에서 `[x]` 로 바꾼다.
- `backend 진행해` 는 Phase 2 전체, `frontend 진행해` 는 Phase 3 전체를 뜻한다.

## Phase 1 - 설계

CLAUDE.md + docs/ 6종 작성.

| 단계 | 검증 방법 | 완료 |
|---|---|---|
| 1.1 CLAUDE.md 작성 (역할 / 기술 스택 / 작업 시작 전 절차 / 절대규칙 6개) | 4개 섹션이 모두 있는지 열어서 확인 | [x] |
| 1.2 `docs/` 에 6개 파일 생성 | `docs/` 에 `00-overview.md` ~ `05-conventions.md` 6개만 있는지 확인 | [x] |
| 1.3 `00-overview.md` 작성 | 매핑표·읽는 순서·화면 4종이 있는지 확인 | [x] |
| 1.4 `01-product.md` 작성 | 목표·MVP 범위·성공 기준이 있는지 확인 | [x] |
| 1.5 `02-specs.md` 작성 | 모델 8필드·API 7개·오류 코드가 있는지 확인 | [x] |
| 1.6 `03-design.md` 작성 | 결정표 8행과 의존성 정책이 있는지 확인 | [x] |
| 1.7 `04-tasks.md` 작성 | Phase 3개, 단계 수 10 / 10 / 8 이 맞는지 확인 | [x] |
| 1.8 `.env` 와 `.gitignore` 준비 | `.env` 에 키 이름만 있고 `.gitignore` 에 `.env` 가 있는지 확인 | [x] |
| 1.9 문서 간 정합성 확인 | CLAUDE.md 의 docs 파일명·순서가 실제 6개 파일과 같은지 확인 | [x] |
| 1.10 `05-conventions.md` 작성 + 첫 커밋 | `git log` 에 `docs: CLAUDE.md + docs 6종 작성` 커밋이 있는지 확인 | [x] |

## Phase 2 - 백엔드

`backend/` FastAPI > API 7개 + 받아쓰기 > Swagger 확인.

- 서버 포트는 **8000** 으로 고정한다.
- 의존성은 아래 8개로 한정하고, 이 목록 밖은 추가하지 않는다.
  - `fastapi`, `uvicorn`, `sqlalchemy`, `pytest`, `httpx`, `google-genai`, `python-multipart`, `python-dotenv`
- pytest 실행 시 httpx2 설치 권고가 떠도 무시한다.

| 단계 | 검증 방법 | 완료 |
|---|---|---|
| 2.1 `backend/` 생성, 가상환경(`.venv`), 의존성 8개 설치 | `pip list` 에 8개가 있고 목록 밖 패키지를 직접 추가하지 않았는지 확인 | [x] |
| 2.2 `.env` 읽기 설정 (`GEMINI_API_KEY`, `GEMINI_MODEL`) | 코드에 키 문자열이 없고 `os.getenv` 로만 읽는지 확인 | [x] |
| 2.3 `Meeting` 모델 8필드, `id` 에 AUTOINCREMENT | 생성된 테이블 SQL 에 `AUTOINCREMENT` 가 있는지 확인 | [x] |
| 2.4 검증 오류 400 예외 핸들러, 스펙 외 필드 422 (`extra="forbid"`) | title 누락은 400, 스펙 외 필드는 422 가 나오는지 확인 | [x] |
| 2.5 `POST /api/notes` (201), `GET /api/notes` (목록, `body` 제외), `GET /api/notes/{id}` (단건, `body` 포함) | 생성 후 목록·단건 응답의 `body` 유무와 404 확인 | [x] |
| 2.6 `PUT /api/notes/{id}` (200), `DELETE /api/notes/{id}` (204) | 수정 값이 반영되고 삭제 후 조회가 404 인지, 지운 id 가 재사용되지 않는지 확인 | [x] |
| 2.7 검색 `q` (제목·참석자), `from`·`to` (양끝 포함) | `q=기획` 은 제목·참석자 일치만, `to` 는 그날 23:59:59 까지 포함되는지 확인 | [x] |
| 2.8 `GET /api/todos` (`what`/`who`/`when`/`note_id`/`note_title`, 회의 날짜 오래된 순) | 응답 필드와 정렬 순서 확인 | [x] |
| 2.9 `POST /api/upload` 받아쓰기 + 세 갈래 구분 (mp3/wav 외 415, 25MB 초과 413, 외부 호출 실패 502, 구분 실패 시 빈 값으로 201 저장) | 실제 Gemini 호출로 본문이 반환되고 세 갈래로 저장되는지, 오류 코드가 맞는지 확인 | [x] |
| 2.10 pytest 13케이스 통과, 포트 8000 에서 Swagger(`/docs`) 확인 | `pytest` 전체 통과, 브라우저에서 `http://localhost:8000/docs` 에 7개 API 가 보이는지 확인 | [x] |

## Phase 3 - 프론트

`frontend/` HTML + JS + Tailwind > 화면 4종 > API 연결 > git push.

- 화면 4종은 `02-specs.md` 화면 명세와 `03-design.md` 표대로 만든다.
- 파일은 `index.html` 과 `app.js` 2개만 둔다.

| 단계 | 검증 방법 | 완료 |
|---|---|---|
| 3.1 `index.html` 뼈대: 상단 고정 헤더(제목, 탭 3개, 테마 버튼), 본문 `max-w-6xl` 가운데 정렬 | 브라우저에서 헤더가 고정되고 탭 3개와 테마 버튼이 보이는지 확인 | [x] |
| 3.2 목록 화면: 검색 입력과 카드 영역 (2열, 360px 에서 1열) | 카드가 2열로 나오고 360px 에서 1열로 바뀌는지 확인 | [x] |
| 3.3 넣기 화면: 입력 폼, 파일 업로드, 결과 세 칸 | 폼 요소와 결과 세 칸(요약·결정사항·할 일)이 보이는지 확인 | [x] |
| 3.4 상세 화면: 겹침 창, 제목 수정, 두 번 눌러야 지워지는 삭제 | 바깥 영역 클릭으로 닫히고 삭제가 한 번 더 눌러야 실행되는지 확인 | [x] |
| 3.5 할 일 화면: 담당자·기한·회의 표, 좁은 화면에서 표만 가로 스크롤 | 360px 에서 문서 전체에는 가로 스크롤이 없고 표만 스크롤되는지 확인 | [x] |
| 3.6 요소 이름 확인: HTML 의 id 가 `03-design.md` 표와 같은지 비교 | `q` `from` `to` `cards` `title` `metAt` `attendees` `file` `body` `btnUp` `btnSave` `result` `modal` `mTitle` `todoBody` 가 모두 있고 다른 이름이 없는지 확인 | [x] |
| 3.7 API 연결: 같은 오리진(포트 8000)에서 `/api/` 호출, 테마 토글(`localStorage`) | 녹취 파일 하나가 세 갈래로 저장되고 새로고침해도 유지, 검색으로 지난 회의가 찾아지는지, 360px 에서 안 깨지는지 확인 | [x] |
| 3.8 `git push` | 원격 저장소에 커밋이 올라갔는지 확인 | [ ] |
