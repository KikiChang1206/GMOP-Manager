// Google Sheets 後端 —— 你之後把試算表與服務帳戶憑證備妥後再啟用。
// 啟用方式:.env 設 DATASTORE=google-sheets 並填好 GOOGLE_* 欄位。
//
// 需要在 Google Cloud 開一個服務帳戶、下載金鑰 JSON,
// 並把該服務帳戶的 email 加入試算表的「共用」(編輯權限)。
// 詳見 README 的「切換到 Google Sheet」章節。
import fs from 'node:fs';
import { google } from 'googleapis';
import { config } from '../config.js';

// 試算表欄位順序(對應設計文件 Sheet1 / Sheet2)
const CUSTOMER_HEADERS = [
  'customer_id', '客戶名稱', '地址', '固定時間', '電話', '聯絡人',
  '頻率類型', '頻率星期', '生效日期', '客人備註', '狀態', '建立時間',
];
const LOG_HEADERS = ['執行日期', 'customer_id', '客戶名稱', '執行結果', '失敗原因', '執行時間戳記'];

// 內部欄位 <-> 試算表欄位 對照
const CUSTOMER_KEYS = [
  'customer_id', 'name', 'address', 'fixedTime', 'phone', 'contact',
  'frequencyType', 'weekdays', 'effectiveDate', 'customerNote', 'statusLabel', 'createdAt',
];

function statusToLabel(s) {
  return s === 'paused' ? '暫停' : '啟用';
}
function labelToStatus(l) {
  return String(l).trim() === '暫停' ? 'paused' : 'active';
}

export class GoogleSheetsStore {
  constructor() {
    if (!config.google.sheetId) {
      throw new Error('DATASTORE=google-sheets 但未設定 GOOGLE_SHEET_ID');
    }
    const raw = fs.readFileSync(config.google.credentialsPath, 'utf8');
    const creds = JSON.parse(raw);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
    this.sheetId = config.google.sheetId;
    this.customersTab = config.google.customersTab;
    this.logsTab = config.google.logsTab;
  }

  async #read(tab) {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: `${tab}!A1:Z`,
    });
    return res.data.values || [];
  }

  async #append(tab, row) {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: `${tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  }

  async listCustomers() {
    const rows = await this.#read(this.customersTab);
    if (rows.length <= 1) return []; // 只有表頭或空
    return rows.slice(1).map((r) => {
      const obj = {};
      CUSTOMER_KEYS.forEach((key, i) => (obj[key] = r[i] ?? ''));
      obj.status = labelToStatus(obj.statusLabel);
      delete obj.statusLabel;
      return obj;
    });
  }

  async addCustomer(record) {
    const row = [
      record.customer_id, record.name, record.address, record.fixedTime,
      record.phone, record.contact, record.frequencyType, record.weekdays,
      record.effectiveDate, record.customerNote, statusToLabel(record.status), record.createdAt,
    ];
    await this.#append(this.customersTab, row);
  }

  async updateStatus(customerId, status) {
    const rows = await this.#read(this.customersTab);
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === customerId);
    if (idx < 0) throw new Error(`找不到 customer_id=${customerId}`);
    // 狀態在第 11 欄(K 欄)
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range: `${this.customersTab}!K${idx + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[statusToLabel(status)]] },
    });
  }

  async appendLog(logRow) {
    await this.#append(this.logsTab, [
      logRow.runDate, logRow.customer_id, logRow.name,
      logRow.result, logRow.errorReason || '', logRow.timestamp,
    ]);
  }

  async listLogs() {
    const rows = await this.#read(this.logsTab);
    if (rows.length <= 1) return [];
    return rows.slice(1).map((r) => ({
      runDate: r[0], customer_id: r[1], name: r[2],
      result: r[3], errorReason: r[4], timestamp: r[5],
    }));
  }

  // 首次使用可呼叫此方法建立表頭(README 有說明)。
  async ensureHeaders() {
    for (const [tab, headers] of [
      [this.customersTab, CUSTOMER_HEADERS],
      [this.logsTab, LOG_HEADERS],
    ]) {
      const rows = await this.#read(tab);
      if (rows.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range: `${tab}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [headers] },
        });
      }
    }
  }
}
