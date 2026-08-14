// 表單伺服器:
//   GET  /            客人自助設定表單(客人看到的介面)
//   POST /api/customers   接收表單送出,寫入資料儲存
//   GET  /admin       管理者檢視頁(取代「在 Google Sheet 看資料」)
//   GET  /api/admin/customers  管理者:列出所有客人設定(需密碼)
//   GET  /api/admin/logs       管理者:列出執行記錄(需密碼)
//   POST /api/admin/status     管理者:啟用/暫停某客人(需密碼)
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { log } from './logger.js';
import { getStore } from './datastore/index.js';
import { validateCustomer, newCustomerRecord } from './schedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC));

const store = getStore();

// 客人設定表單(客人看到的介面)放在根路徑
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'form.html')));

// 簡易管理者驗證:比對 header 或 query 的密碼
function requireAdmin(req, res, next) {
  const pw = req.get('x-admin-password') || req.query.pw || '';
  // 定時比較避免時序側漏(雖然此情境要求不高,習慣做好)
  const a = Buffer.from(String(pw));
  const b = Buffer.from(String(config.adminPassword));
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  return res.status(401).json({ ok: false, error: '密碼錯誤' });
}

// --- 客人:送出設定表單 ---
app.post('/api/customers', async (req, res) => {
  try {
    const errors = validateCustomer(req.body);
    if (errors.length) return res.status(400).json({ ok: false, errors });

    const record = newCustomerRecord({
      ...req.body,
      customer_id: 'C' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'),
    });
    await store.addCustomer(record);
    log.info('新增客人設定:', record.name, record.customer_id);
    res.json({ ok: true, customer_id: record.customer_id });
  } catch (e) {
    log.error('新增客人設定失敗:', e.message);
    res.status(500).json({ ok: false, error: '系統錯誤,請稍後再試' });
  }
});

// --- 管理者頁面 ---
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC, 'admin.html')));

app.get('/api/admin/customers', requireAdmin, async (req, res) => {
  res.json({ ok: true, customers: await store.listCustomers() });
});

app.get('/api/admin/logs', requireAdmin, async (req, res) => {
  const logs = await store.listLogs();
  res.json({ ok: true, logs: logs.slice(-200).reverse() }); // 最近 200 筆,新的在前
});

app.post('/api/admin/status', requireAdmin, async (req, res) => {
  try {
    const { customer_id, status } = req.body;
    if (!['active', 'paused'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'status 需為 active/paused' });
    }
    await store.updateStatus(customer_id, status);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 刪除一筆或多筆客人設定(customer_ids: 陣列)
app.post('/api/admin/delete', requireAdmin, async (req, res) => {
  try {
    const ids = req.body.customer_ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, error: '請提供要刪除的 customer_ids 陣列' });
    }
    const removed = await store.deleteCustomers(ids);
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 編輯既有客人設定(customer_id + 欄位;沿用與新增相同的驗證)
app.post('/api/admin/update', requireAdmin, async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ ok: false, error: '缺少 customer_id' });
    const errors = validateCustomer(req.body);
    if (errors.length) return res.status(400).json({ ok: false, errors });
    const f = req.body;
    await store.updateCustomer(customer_id, {
      name: f.name, address: f.address, fixedTime: f.fixedTime, phone: f.phone,
      contact: f.contact, frequencyType: f.frequencyType, weekdays: f.weekdays,
      effectiveDate: f.effectiveDate, customerNote: f.customerNote,
    });
    log.info('編輯客人設定:', f.name, customer_id);
    res.json({ ok: true });
  } catch (e) {
    log.error('編輯客人設定失敗:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(config.port, () => {
  log.info(`表單伺服器啟動:http://localhost:${config.port}`);
  log.info(`  客人設定表單:  http://localhost:${config.port}/`);
  log.info(`  管理者檢視頁:  http://localhost:${config.port}/admin`);
  log.info(`  資料後端:      ${config.datastore}`);
});
