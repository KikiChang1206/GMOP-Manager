// 讀取 .env 並集中匯出設定,方便各模組共用。
// 敏感資訊一律走環境變數,不寫死在程式碼(設計文件第10點)。
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

function bool(v, def = false) {
  if (v === undefined || v === '') return def;
  return v === '1' || String(v).toLowerCase() === 'true';
}

function list(v) {
  return (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  adminPassword: process.env.ADMIN_PASSWORD || 'change-me',

  datastore: process.env.DATASTORE || 'local',
  google: {
    sheetId: process.env.GOOGLE_SHEET_ID || '',
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json',
    customersTab: process.env.GOOGLE_SHEET_CUSTOMERS_TAB || '客人設定主表',
    logsTab: process.env.GOOGLE_SHEET_LOGS_TAB || '執行記錄表',
  },

  goodmaji: {
    url: process.env.GOODMAJI_URL || 'https://system.goodmaji.com',
    code: process.env.GOODMAJI_CODE || '',          // 登入第一欄「編號」
    username: process.env.GOODMAJI_USERNAME || '',   // 登入第二欄「帳號 / Account」
    password: process.env.GOODMAJI_PASSWORD || '',   // 登入第三欄「密碼 / Password」
  },

  line: {
    token: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    targets: list(process.env.LINE_NOTIFY_TARGETS),
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || '',
    to: list(process.env.MAIL_TO),
  },

  run: {
    packageCount: process.env.DEFAULT_PACKAGE_COUNT ?? '0',
    note: process.env.DEFAULT_NOTE || '件數確認中',
    headless: bool(process.env.HEADLESS, true),
    stepTimeoutMs: parseInt(process.env.STEP_TIMEOUT_MS || '15000', 10),
    dryRun: bool(process.env.DRY_RUN, false),
  },
};
