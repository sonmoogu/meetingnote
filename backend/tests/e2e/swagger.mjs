import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'http://localhost:8000';
const results = [];
let noteId = null;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

async function openOp(page, method, route) {
  await page.goto(`${BASE}/docs`);
  const op = page.locator(`.opblock-${method}`).filter({ has: page.locator(`.opblock-summary-path[data-path="${route}"]`) });
  await op.locator('.opblock-summary-control').click();
  await op.locator('.try-out__btn').click();
  return op;
}

async function execute(op) {
  await op.locator('.execute').click();
  const status = op.locator('.live-responses-table .response .response-col_status').first();
  await status.waitFor({ timeout: 90000 });
  const code = Number((await status.innerText()).match(/\d{3}/)[0]);
  const bodyLoc = op.locator('.live-responses-table .response .response-col_description .microlight').first();
  const body = (await bodyLoc.count()) ? (await bodyLoc.innerText()).trim() : '';
  return { code, body };
}

async function record(name, request, expected, fn) {
  const page = await context.newPage();
  const started = Date.now();
  let actual = null;
  let note = '';
  try {
    const out = await fn(page);
    actual = out.code;
    note = out.note || '';
  } catch (error) {
    note = `ERROR: ${String(error.message).split('\n')[0]}`;
  }
  results.push({ name, request, expected, actual, pass: actual === expected && !note.startsWith('ERROR') && !note.startsWith('FAIL'), note, ms: Date.now() - started });
  await page.close();
}

const validNote = { title: 'Swagger 테스트 회의', met_at: '2025-03-04T01:00:00Z', attendees: '김대리, 이주임', body: '오늘 회의에서 출시일을 다음 달 10일로 확정했습니다. 디자인 시안은 김대리가 다음 주 금요일까지 전달하기로 했습니다. 마케팅 예산은 논의만 했고 정하지 못했습니다.' };

await record('노트 생성', 'POST /api/notes (title+met_at+body)', 201, async (page) => {
  const op = await openOp(page, 'post', '/api/notes');
  await op.locator('.body-param__text').fill(JSON.stringify(validNote));
  const r = await execute(op);
  const data = JSON.parse(r.body);
  noteId = data.id;
  const separated = Boolean(data.summary && data.decisions && data.todos);
  return { code: r.code, note: separated ? `id=${noteId}, 세 갈래 구분됨` : `FAIL: 세 갈래 비어 있음 (id=${noteId})` };
});

await record('목록', 'GET /api/notes', 200, async (page) => {
  const op = await openOp(page, 'get', '/api/notes');
  const r = await execute(op);
  const items = JSON.parse(r.body);
  const hasBody = items.some((i) => 'body' in i);
  return { code: r.code, note: hasBody ? 'FAIL: body 포함됨' : `${items.length}건, body 없음` };
});

await record('단건', 'GET /api/notes/{id}', 200, async (page) => {
  const op = await openOp(page, 'get', '/api/notes/{note_id}');
  await op.locator('tr[data-param-name="note_id"] input').fill(String(noteId));
  const r = await execute(op);
  const data = JSON.parse(r.body);
  return { code: r.code, note: data.body ? 'body 있음' : 'FAIL: body 없음' };
});

await record('수정', 'PUT /api/notes/{id} (전 필드)', 200, async (page) => {
  const op = await openOp(page, 'put', '/api/notes/{note_id}');
  await op.locator('tr[data-param-name="note_id"] input').fill(String(noteId));
  const payload = { ...validNote, title: 'Swagger 수정됨', summary: '수정 요약', decisions: '수정 결정', todos: '수정 할 일 | 박과장 | 내일' };
  await op.locator('.body-param__text').fill(JSON.stringify(payload));
  const r = await execute(op);
  const data = JSON.parse(r.body);
  return { code: r.code, note: data.title === 'Swagger 수정됨' ? '제목 반영됨' : 'FAIL: 반영 안 됨' };
});

await record('검색', 'GET /api/notes?q=Swagger', 200, async (page) => {
  const op = await openOp(page, 'get', '/api/notes');
  await op.locator('tr[data-param-name="q"] input').fill('Swagger');
  const r = await execute(op);
  const items = JSON.parse(r.body);
  const ok = items.length >= 1 && items.every((i) => i.title.includes('Swagger') || (i.attendees || '').includes('Swagger'));
  return { code: r.code, note: ok ? `${items.length}건, 제목·참석자 일치만` : 'FAIL: 불일치 항목 있음' };
});

await record('할 일', 'GET /api/todos', 200, async (page) => {
  const op = await openOp(page, 'get', '/api/todos');
  const r = await execute(op);
  const items = JSON.parse(r.body);
  const keys = items.length ? Object.keys(items[0]).sort().join(',') : '';
  const ok = keys === 'note_id,note_title,what,when,who';
  return { code: r.code, note: ok ? `${items.length}건, 응답 필드 5개 일치` : `FAIL: 필드 ${keys || '없음'}` };
});

await record('title 누락', 'POST /api/notes (title 없음)', 400, async (page) => {
  const op = await openOp(page, 'post', '/api/notes');
  await op.locator('.body-param__text').fill(JSON.stringify({ met_at: '2025-03-04T01:00:00Z', body: '본문' }));
  return execute(op);
});

await record('met_at 형식 오류', 'POST /api/notes (met_at="어제쯤")', 400, async (page) => {
  const op = await openOp(page, 'post', '/api/notes');
  await op.locator('.body-param__text').fill(JSON.stringify({ title: 't', met_at: '어제쯤', body: '본문' }));
  return execute(op);
});

await record('없는 id', 'GET /api/notes/99999', 404, async (page) => {
  const op = await openOp(page, 'get', '/api/notes/{note_id}');
  await op.locator('tr[data-param-name="note_id"] input').fill('99999');
  return execute(op);
});

await record('스펙 외 필드', 'POST /api/notes (unknown 필드 포함)', 422, async (page) => {
  const op = await openOp(page, 'post', '/api/notes');
  await op.locator('.body-param__text').fill(JSON.stringify({ title: 't', met_at: '2025-03-04T01:00:00Z', body: '본문', unknown: 1 }));
  return execute(op);
});

await record('업로드 mp4', 'POST /api/upload (meeting.mp4)', 415, async (page) => {
  const op = await openOp(page, 'post', '/api/upload');
  await op.locator('input[type=file]').setInputFiles({ name: 'meeting.mp4', mimeType: 'video/mp4', buffer: Buffer.from('x') });
  return execute(op);
});

await record('업로드 30MB', 'POST /api/upload (30MB mp3)', 413, async (page) => {
  const op = await openOp(page, 'post', '/api/upload');
  const big = path.join(os.tmpdir(), 'mn_30mb.mp3');
  fs.writeFileSync(big, Buffer.alloc(30 * 1024 * 1024));
  await op.locator('input[type=file]').setInputFiles(big);
  const r = await execute(op);
  fs.unlinkSync(big);
  return r;
});

await record('업로드 wav (실제 Gemini)', 'POST /api/upload (wav)', 200, async (page) => {
  const op = await openOp(page, 'post', '/api/upload');
  await op.locator('input[type=file]').setInputFiles(path.join(os.tmpdir(), 'mn_sample.wav'));
  const r = await execute(op);
  const text = JSON.parse(r.body).text || '';
  return { code: r.code, note: text ? `받아쓴 본문: "${text.replace(/\s+/g, ' ').slice(0, 80)}"` : 'FAIL: 본문 비어 있음' };
});

await record('삭제', 'DELETE /api/notes/{id}', 204, async (page) => {
  const op = await openOp(page, 'delete', '/api/notes/{note_id}');
  await op.locator('tr[data-param-name="note_id"] input').fill(String(noteId));
  return execute(op);
});

await record('삭제 후 조회', 'GET /api/notes/{id} (삭제한 id)', 404, async (page) => {
  const op = await openOp(page, 'get', '/api/notes/{note_id}');
  await op.locator('tr[data-param-name="note_id"] input').fill(String(noteId));
  return execute(op);
});

const shot = await context.newPage();
await shot.goto(`${BASE}/docs`);
await shot.waitForSelector('.opblock');
await shot.screenshot({ path: path.join(os.tmpdir(), 'swagger-overview.png'), fullPage: true });

await browser.close();
fs.writeFileSync(path.join(os.tmpdir(), 'swagger-results.json'), JSON.stringify(results, null, 2));
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.name} | 기대 ${r.expected} 실제 ${r.actual} | ${r.note}`);
