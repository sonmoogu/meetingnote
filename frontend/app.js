// 상태: 모듈 변수 + DOM 직접 갱신
let currentView = 'list';
let currentNote = null;
let deleteArmed = false;
let deleteTimer = null;
let searchTimer = null;

const $ = (id) => document.getElementById(id);
const role = (name) => document.querySelector(`[data-role="${name}"]`);

// ---------- 공통 ----------
async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = `요청 실패 (${response.status})`;
    if (response.status === 413) message = '25MB 이하 파일만 올릴 수 있습니다.';
    else if (response.status === 415) message = 'mp3, wav 파일만 올릴 수 있습니다.';
    else if (response.status === 502) message = '받아쓰기 호출에 실패했습니다. 잠시 뒤 다시 시도해 주세요.';
    else if (response.status === 400) message = '필수 항목을 확인해 주세요.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function makeEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(iso) {
  // 서버는 UTC 로 주므로 화면에서는 로컬 시각으로 되돌린다
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isSeparated(note) {
  return Boolean(note.summary || note.decisions || note.todos);
}

function firstLine(text) {
  return (text || '').split('\n').find((line) => line.trim()) || '';
}

// ---------- 화면 전환 ----------
function showView(name) {
  currentView = name;
  document.querySelectorAll('[data-view]').forEach((section) => {
    section.classList.toggle('hidden', section.dataset.view !== name);
  });
  document.querySelectorAll('[data-tab]').forEach((button) => {
    if (button.dataset.tab === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (name === 'list') loadNotes();
  if (name === 'todos') loadTodos();
}

// ---------- 테마 ----------
function toggleTheme() {
  const dark = document.documentElement.classList.toggle('dark');
  try {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  } catch (e) {
    // 저장이 막힌 환경에서는 이번 방문에서만 적용한다
  }
}

// ---------- 목록 ----------
async function loadNotes() {
  const params = new URLSearchParams();
  if ($('q').value.trim()) params.set('q', $('q').value.trim());
  if ($('from').value) params.set('from', $('from').value);
  if ($('to').value) params.set('to', $('to').value);
  const cards = $('cards');
  try {
    const notes = await api(`/api/notes?${params}`);
    cards.replaceChildren();
    if (notes.length === 0) {
      cards.append(makeEl('p', 'text-sm text-slate-500 dark:text-zinc-400 md:col-span-2', '저장된 회의록이 없습니다.'));
      return;
    }
    notes.forEach((note) => cards.append(buildCard(note)));
  } catch (error) {
    cards.replaceChildren(makeEl('p', 'text-sm text-red-600 md:col-span-2', error.message));
  }
}

function buildCard(note) {
  const card = makeEl('button', 'card min-w-0 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-xl');
  card.type = 'button';
  card.append(makeEl('h3', 'break-words font-semibold', note.title));
  const attendees = note.attendees ? ` · ${note.attendees}` : '';
  card.append(makeEl('p', 'mt-1 break-words text-xs text-slate-500 dark:text-zinc-400', `${formatDate(note.met_at)}${attendees}`));
  const summary = firstLine(note.summary);
  card.append(makeEl('p', 'mt-3 break-words text-sm', summary || (isSeparated(note) ? '' : '구분 실패 - 요약 없음')));
  card.addEventListener('click', () => openModal(note.id));
  return card;
}

// ---------- 넣기 ----------
function resetNewForm() {
  $('title').value = '';
  $('attendees').value = '';
  $('body').value = '';
  $('file').value = '';
  $('metAt').value = toLocalInputValue(new Date());
}

async function uploadAudio() {
  const status = role('upStatus');
  const file = $('file').files[0];
  if (!file) {
    status.textContent = '파일을 먼저 선택해 주세요.';
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  $('btnUp').disabled = true;
  status.textContent = '받아쓰는 중...';
  try {
    const data = await api('/api/upload', { method: 'POST', body: formData });
    $('body').value = data.text;
    status.textContent = '받아쓰기 완료. 본문을 확인해 주세요.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    $('btnUp').disabled = false;
  }
}

async function saveNote() {
  const status = role('saveStatus');
  const title = $('title').value.trim();
  const body = $('body').value.trim();
  if (!title || !$('metAt').value || !body) {
    status.textContent = '제목, 일시, 본문을 모두 입력해 주세요.';
    return;
  }
  const payload = {
    title,
    // datetime-local 값은 로컬 시각이므로 UTC 로 바꿔 보낸다
    met_at: new Date($('metAt').value).toISOString(),
    attendees: $('attendees').value.trim() || null,
    body,
  };
  $('btnSave').disabled = true;
  status.textContent = '정리하는 중...';
  try {
    const note = await api('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showResult(note);
    status.textContent = '저장했습니다.';
    resetNewForm();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    $('btnSave').disabled = false;
  }
}

function showResult(note) {
  role('resSummary').textContent = note.summary || '';
  role('resDecisions').textContent = note.decisions || '';
  role('resTodos').textContent = note.todos || '';
  role('resultFail').classList.toggle('hidden', isSeparated(note));
  $('result').classList.remove('hidden');
}

// ---------- 상세 ----------
function fillList(listNode, text, formatLine) {
  listNode.replaceChildren();
  (text || '').split('\n').filter((line) => line.trim()).forEach((line) => {
    listNode.append(makeEl('li', '', formatLine ? formatLine(line) : line));
  });
}

function formatTodoLine(line) {
  const [what, who, when] = line.split('|').map((part) => part.trim());
  return [what, who, when].filter(Boolean).join(' · ');
}

async function openModal(id) {
  try {
    currentNote = await api(`/api/notes/${id}`);
  } catch (error) {
    alert(error.message);
    return;
  }
  renderModal();
  role('mStatus').textContent = '';
  disarmDelete();
  const modal = $('modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function renderModal() {
  const note = currentNote;
  role('mDetailTitle').textContent = note.title;
  const attendees = note.attendees ? ` · ${note.attendees}` : '';
  role('mMeta').textContent = `${formatDate(note.met_at)}${attendees}`;
  role('mSummary').textContent = note.summary || (isSeparated(note) ? '' : '구분 실패 - 요약이 비어 있습니다.');
  fillList(role('mDecisions'), note.decisions);
  fillList(role('mTodos'), note.todos, formatTodoLine);
  role('mBody').textContent = note.body;
  $('mTitle').value = note.title;
}

function closeModal() {
  const modal = $('modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  currentNote = null;
  disarmDelete();
}

async function renameNote() {
  const title = $('mTitle').value.trim();
  const status = role('mStatus');
  if (!title) {
    status.textContent = '제목을 입력해 주세요.';
    return;
  }
  const note = currentNote;
  try {
    currentNote = await api(`/api/notes/${note.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        met_at: note.met_at,
        attendees: note.attendees,
        body: note.body,
        summary: note.summary,
        decisions: note.decisions,
        todos: note.todos,
      }),
    });
    renderModal();
    status.textContent = '제목을 수정했습니다.';
    loadNotes();
  } catch (error) {
    status.textContent = error.message;
  }
}

function disarmDelete() {
  deleteArmed = false;
  clearTimeout(deleteTimer);
  role('mDelete').textContent = '삭제';
}

async function deleteNote() {
  // 삭제는 한 번 더 눌러야 지워진다
  if (!deleteArmed) {
    deleteArmed = true;
    role('mDelete').textContent = '한 번 더 누르면 삭제';
    deleteTimer = setTimeout(disarmDelete, 3000);
    return;
  }
  try {
    await api(`/api/notes/${currentNote.id}`, { method: 'DELETE' });
    closeModal();
    loadNotes();
  } catch (error) {
    role('mStatus').textContent = error.message;
    disarmDelete();
  }
}

// ---------- 할 일 ----------
async function loadTodos() {
  const body = $('todoBody');
  try {
    const todos = await api('/api/todos');
    body.replaceChildren();
    if (todos.length === 0) {
      const row = makeEl('tr');
      const cell = makeEl('td', 'px-4 py-6 text-slate-500 dark:text-zinc-400', '할 일이 없습니다.');
      cell.colSpan = 4;
      row.append(cell);
      body.append(row);
      return;
    }
    todos.forEach((todo) => {
      const row = makeEl('tr', 'border-b border-black/5 last:border-0 dark:border-white/10');
      [todo.what, todo.who, todo.when, todo.note_title].forEach((text) => {
        row.append(makeEl('td', 'px-4 py-3 align-top', text));
      });
      body.append(row);
    });
  } catch (error) {
    body.replaceChildren();
    const row = makeEl('tr');
    const cell = makeEl('td', 'px-4 py-6 text-red-600', error.message);
    cell.colSpan = 4;
    row.append(cell);
    body.append(row);
  }
}

// ---------- 초기화 ----------
document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.tab));
});
role('themeToggle').addEventListener('click', toggleTheme);

['q', 'from', 'to'].forEach((id) => {
  $(id).addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadNotes, 200);
  });
});

$('btnUp').addEventListener('click', uploadAudio);
$('btnSave').addEventListener('click', saveNote);

$('modal').addEventListener('click', (event) => {
  if (event.target === $('modal')) closeModal();
});
role('mClose').addEventListener('click', closeModal);
role('mRename').addEventListener('click', renameNote);
role('mDelete').addEventListener('click', deleteNote);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && currentNote) closeModal();
});

resetNewForm();
showView(currentView);
