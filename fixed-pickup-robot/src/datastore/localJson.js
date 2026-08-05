// 本機 JSON 後端 —— 預設值,免任何外部設定,裝好就能跑。
// 客人設定存 data/customers.json,執行記錄存 data/logs.json。
// 之後要換 Google Sheet,只要把 .env 的 DATASTORE 改成 google-sheets 即可,上層不用動。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';

const DATA_DIR = path.join(ROOT, 'data');
const CUSTOMERS = path.join(DATA_DIR, 'customers.json');
const LOGS = path.join(DATA_DIR, 'logs.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // 先寫暫存檔再 rename,避免寫到一半當掉造成檔案毀損
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export class LocalJsonStore {
  async listCustomers() {
    return readJson(CUSTOMERS, []);
  }

  async addCustomer(record) {
    const all = readJson(CUSTOMERS, []);
    all.push(record);
    writeJson(CUSTOMERS, all);
  }

  async updateStatus(customerId, status) {
    const all = readJson(CUSTOMERS, []);
    const row = all.find((c) => c.customer_id === customerId);
    if (!row) throw new Error(`找不到 customer_id=${customerId}`);
    row.status = status;
    writeJson(CUSTOMERS, all);
  }

  async appendLog(logRow) {
    const all = readJson(LOGS, []);
    all.push(logRow);
    writeJson(LOGS, all);
  }

  async listLogs() {
    return readJson(LOGS, []);
  }
}
