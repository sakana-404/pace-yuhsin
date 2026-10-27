import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = Number(process.env.WORKOUT_RECORDS_PORT || 8788);
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const MAX_RECORDS_PER_IMPORT = 500;
const DATA_FILE = fileURLToPath(new URL('../data/workout-records.json', import.meta.url));
let writeQueue = Promise.resolve();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'JSON 檔案不可超過 20 MB。');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new HttpError(400, '請提供有效的 JSON 檔案。');
  }
}

function optionalNumber(value, name, index) {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, `第 ${index + 1} 筆的 ${name} 必須是數字。`);
  }
  return value;
}

function optionalText(value, name, index, maxLength = 160) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, `第 ${index + 1} 筆的 ${name} 必須是文字。`);
  return value.trim().slice(0, maxLength) || null;
}

function summarize(record, index) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new HttpError(400, `第 ${index + 1} 筆不是 JSON 物件。`);
  }

  const meters = optionalNumber(record.meters, 'meters', index);
  const seconds = optionalNumber(record.seconds, 'seconds', index);
  if (meters == null || meters < 0 || seconds == null || seconds < 0) {
    throw new HttpError(400, `第 ${index + 1} 筆缺少有效的 meters 或 seconds。`);
  }

  const date = record.date == null ? new Date() : new Date(record.date);
  if (!Number.isFinite(date.getTime())) {
    throw new HttpError(400, `第 ${index + 1} 筆的 date 不是有效時間。`);
  }
  const occurredAt = date.toISOString();
  const id = record.id == null ? null : String(record.id).slice(0, 191);
  const alias = optionalText(record.alias, 'alias', index);
  const userId = optionalText(record.userId ?? record.user_id, 'userId', index);
  const location = optionalText(record.location ?? record.place ?? record.locationName ?? record.campus, 'location', index);
  const sex = optionalText(record.sex, 'sex', index, 16);
  const bodyFatPercent = optionalNumber(record.bodyFatPercent, 'bodyFatPercent', index);
  if (bodyFatPercent != null && (bodyFatPercent < 0 || bodyFatPercent > 100)) {
    throw new HttpError(400, `第 ${index + 1} 筆的 bodyFatPercent 必須介於 0 到 100。`);
  }

  const summary = {
    id,
    occurredAt,
    location,
    alias,
    userId,
    sex,
    age: optionalNumber(record.age, 'age', index),
    heightCm: optionalNumber(record.height, 'height', index),
    weightKg: optionalNumber(record.weight, 'weight', index),
    bodyFatPercent,
    activity: optionalText(record.mode, 'mode', index),
    seconds,
    meters,
    met: optionalNumber(record.met, 'met', index),
    kcal: optionalNumber(record.kcal, 'kcal', index),
    savedAt: new Date().toISOString(),
  };

  const fingerprintSource = id ?? JSON.stringify([occurredAt, userId, alias, location, meters, seconds, summary.activity]);
  summary.id = id || createHash('sha256').update(fingerprintSource).digest('hex');
  return summary;
}

async function readStoredRecords() {
  try {
    const content = await readFile(DATA_FILE, 'utf8');
    const records = JSON.parse(content);
    if (!Array.isArray(records)) throw new Error('紀錄檔格式不是 JSON 陣列。');
    return records;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendSummaries(summaries) {
  const operation = writeQueue.then(async () => {
    const existing = await readStoredRecords();
    const existingIds = new Set(existing.map(record => String(record.id)));
    const added = summaries.filter(record => {
      if (existingIds.has(String(record.id))) return false;
      existingIds.add(String(record.id));
      return true;
    });
    if (!added.length) return { received: summaries.length, saved: 0, duplicates: summaries.length };

    const updated = [...existing, ...added];
    await mkdir(dirname(DATA_FILE), { recursive: true });
    const tempFile = `${DATA_FILE}.tmp-${randomUUID()}`;
    await writeFile(tempFile, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(tempFile, DATA_FILE);
    return { received: summaries.length, saved: added.length, duplicates: summaries.length - added.length };
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${HOST}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true, storage: 'local-json' });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/workouts/import') {
      if (!(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        throw new HttpError(415, 'Content-Type 必須是 application/json。');
      }
      const payload = await readJson(request);
      const records = Array.isArray(payload) ? payload : [payload];
      if (!records.length || records.length > MAX_RECORDS_PER_IMPORT) {
        throw new HttpError(400, `每次請匯入 1 到 ${MAX_RECORDS_PER_IMPORT} 筆紀錄。`);
      }
      const summaries = records.map(summarize);
      sendJson(response, 201, await appendSummaries(summaries));
      return;
    }
    if (url.pathname === '/api/workouts/import' || url.pathname === '/health') {
      sendJson(response, 405, { error: '不支援此 HTTP 方法。' });
      return;
    }
    sendJson(response, 404, { error: '找不到此路徑。' });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error('運動摘要保存失敗：', error.message);
    sendJson(response, status, { error: status === 500 ? '無法寫入本機 JSON 紀錄檔。' : error.message });
  }
});

await mkdir(dirname(DATA_FILE), { recursive: true });
try {
  await readFile(DATA_FILE);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(DATA_FILE, '[]\n', { encoding: 'utf8', flag: 'wx' });
}

server.listen(PORT, HOST, () => {
  console.log(`本機運動摘要服務已啟動：http://${HOST}:${PORT}`);
  console.log(`摘要檔案：${DATA_FILE}`);
});

async function shutdown() {
  server.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
