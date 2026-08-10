// Playwright 自動化主流程(設計文件第6節)。
// 設計原則:
//   - 逐位新增,但最後統一按一次「儲存」
//   - 任一客人失敗不中斷整批,記錄原因並截圖,繼續下一位
//   - 儲存後一律做反查驗證(見 verify.js)
//   - noSave 模式:只填不儲存(安全測試),並把畫面存到 logs/capture 供檢視
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { config, ROOT } from '../config.js';
import { log } from '../logger.js';
import { selectors } from './selectors.js';
import { verifyAgainstSystem } from './verify.js';

const SHOT_DIR = path.join(ROOT, 'logs', 'screenshots');
const CAPTURE_DIR = path.join(ROOT, 'logs', 'capture');

async function screenshot(page, tag) {
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const file = path.join(SHOT_DIR, `${tag}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    log.warn('已截圖存檔:', file);
    return file;
  } catch {
    return null;
  }
}

// 安全測試用:把當前頁面存到 logs/capture(截圖 + 原始碼),方便 scp 傳回檢視
async function saveToCapture(page, tag) {
  try {
    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
    await page.screenshot({ path: path.join(CAPTURE_DIR, `${tag}.png`), fullPage: true });
    fs.writeFileSync(path.join(CAPTURE_DIR, `${tag}.html`), await page.content());
    log.info(`已存檢視檔:logs/capture/${tag}.png`);
  } catch { /* ignore */ }
}

function todayMMDD() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

async function fillField(scope, selector, value, timeout) {
  const el = scope.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout });
  await el.fill(String(value));
}

// 依「欄位代號 + 列索引」組成實際 id(#rp1_<code>_<idx>)並填值。value 為空則略過。
async function setField(page, code, idx, value, timeout) {
  if (value === undefined || value === null || value === '') return;
  const el = page.locator(`#rp1_${code}_${idx}`).first();
  await el.waitFor({ state: 'visible', timeout });
  await el.fill(String(value));
}

async function login(page) {
  log.info('登入 system.goodmaji.com …');
  await page.goto(config.goodmaji.url, { waitUntil: 'domcontentloaded' });
  await fillField(page, selectors.login.code, config.goodmaji.code, config.run.stepTimeoutMs);
  await fillField(page, selectors.login.username, config.goodmaji.username, config.run.stepTimeoutMs);
  await fillField(page, selectors.login.password, config.goodmaji.password, config.run.stepTimeoutMs);
  await page.locator(selectors.login.submit).first().click();
  await page.locator(selectors.login.successMarker).first()
    .waitFor({ state: 'visible', timeout: config.run.stepTimeoutMs });
  log.info('登入成功');
}

// 登入後直接開啟「代收包裹 → 一般代取」內層頁 collection.aspx(同 session)
async function gotoGeneralPickup(page) {
  const url = new URL(selectors.nav.collectionPath, config.goodmaji.url).href;
  log.info('開啟一般代取頁:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator(selectors.table.addButton).first()
    .waitFor({ state: 'visible', timeout: config.run.stepTimeoutMs });
}

// 找出剛新增的空白列索引(客戶欄為空的那一列)
async function findNewRowIndex(page, rowsSel) {
  return page.evaluate((sel) => {
    const els = Array.from(document.querySelectorAll(sel));
    const empties = els.filter((e) => !e.value.trim());
    const target = empties.length ? empties[empties.length - 1] : els[els.length - 1];
    if (!target) return null;
    const m = target.id.match(/_(\d+)$/);
    return m ? m[1] : null;
  }, rowsSel);
}

// 新增並填寫單一客人;成功回傳 {ok:true},失敗回傳 {ok:false, reason}
async function addOneCustomer(page, customer) {
  const t = config.run.stepTimeoutMs;
  const rowsSel = selectors.table.rows;
  try {
    // a. 按「新增」→ ASP.NET postback 產生新空白列,等列數增加
    const before = await page.locator(rowsSel).count();
    await page.locator(selectors.table.addButton).first().click();
    await page.waitForFunction(
      ({ sel, n }) => document.querySelectorAll(sel).length > n,
      { sel: rowsSel, n: before },
      { timeout: t },
    );

    // b. 找到剛新增的那一列索引
    const idx = await findNewRowIndex(page, rowsSel);
    if (idx === null) throw new Error('找不到新增的空白列');

    // c. 逐欄填寫
    const f = selectors.rowFields;
    await setField(page, f.customer, idx, customer.name, t);
    await setField(page, f.receiver, idx, config.run.receiver, t);   // 取件人一律填「API」
    await setField(page, f.address, idx, customer.address, t);
    await setField(page, f.date, idx, todayMMDD(), t);
    await setField(page, f.time, idx, customer.fixedTime, t);
    await setField(page, f.packageCount, idx, config.run.packageCount, t);
    await setField(page, f.note, idx, (customer.customerNote || '').trim(), t); // 備註只放客人原本備註
    await setField(page, f.phone, idx, customer.phone, t);
    await setField(page, f.contact, idx, customer.contact, t);

    log.info(`已填寫:${customer.name}(第 ${idx} 列)`);
    return { ok: true };
  } catch (e) {
    await screenshot(page, `fail-${customer.customer_id}`);
    log.error(`填寫失敗(略過,繼續下一位):${customer.name} — ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

/**
 * 執行整批新增 + 儲存 + 反查驗證。
 * @param {object[]} customers 今天要新增的客人清單
 * @param {{noSave?:boolean}} opts noSave=true 時只填不儲存(安全測試)
 */
export async function runRobot(customers, opts = {}) {
  const noSave = opts.noSave ?? config.run.noSave ?? false;
  const browser = await chromium.launch({ headless: config.run.headless, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(config.run.stepTimeoutMs);

  // 記錄網頁彈出訊息(例如儲存時的驗證 alert),方便診斷
  page.on('dialog', async (d) => {
    log.warn('網頁彈出訊息:', d.message());
    try { await d.dismiss(); } catch { /* ignore */ }
  });

  const filled = [];
  const fillFailed = [];

  try {
    await login(page);
    await gotoGeneralPickup(page);

    // 逐位新增(填欄位),先不儲存
    for (const c of customers) {
      const r = await addOneCustomer(page, c);
      if (r.ok) filled.push(c);
      else fillFailed.push({ ...c, reason: r.reason });
    }

    // 安全測試模式:只填不儲存,存檔供檢視後直接結束
    if (noSave) {
      await saveToCapture(page, '5-filled');
      log.warn(`【NO_SAVE 安全測試】已填 ${filled.length} 筆,未按儲存。請檢視 logs/capture/5-filled.png`);
      return { filled, fillFailed, confirmed: [], missing: fillFailed };
    }

    // 統一按一次「儲存」
    if (filled.length > 0) {
      log.info(`統一儲存 ${filled.length} 筆 …`);
      await page.locator(selectors.table.saveButton).first().click();
      await page.waitForTimeout(3000); // 等待儲存 postback 完成
      await saveToCapture(page, '6-saved'); // 存證:儲存後的畫面
    } else {
      log.warn('沒有任何成功填寫的列,略過儲存');
    }

    // 反查驗證:以實際系統資料為準(只驗證有成功填寫的那些)
    const { confirmed, missing } = await verifyAgainstSystem(page, filled);
    const allMissing = [...missing, ...fillFailed];
    return { filled, fillFailed, confirmed, missing: allMissing };
  } catch (e) {
    await screenshot(page, 'fatal');
    log.error('整批流程發生嚴重錯誤:', e.message);
    return {
      filled: [],
      fillFailed: [],
      confirmed: [],
      missing: customers.map((c) => ({ ...c, reason: `整批流程錯誤:${e.message}` })),
    };
  } finally {
    await browser.close();
  }
}
