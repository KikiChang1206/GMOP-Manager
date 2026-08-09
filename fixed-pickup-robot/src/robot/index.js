// Playwright 自動化主流程(設計文件第6節)。
// 設計原則:
//   - 逐位新增,但最後統一按一次「儲存」
//   - 任一客人失敗不中斷整批,記錄原因並截圖,繼續下一位
//   - 儲存後一律做反查驗證(見 verify.js)
import path from 'node:path';
import { chromium } from 'playwright';
import { config, ROOT } from '../config.js';
import { log } from '../logger.js';
import { composeSystemNote } from '../schedule.js';
import { selectors } from './selectors.js';
import { verifyAgainstSystem } from './verify.js';

const SHOT_DIR = path.join(ROOT, 'logs', 'screenshots');

async function screenshot(page, tag) {
  try {
    const file = path.join(SHOT_DIR, `${tag}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    log.warn('已截圖存檔:', file);
    return file;
  } catch {
    return null;
  }
}

// 小工具:對 locator 做重試填值,失敗會拋出讓上層捕捉
async function fillField(scope, selector, value, timeout) {
  const el = scope.locator(selector).first();
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

async function gotoGeneralPickup(page) {
  log.info('導向 代收包裹 → 一般代取 …');
  await page.locator(selectors.nav.parcelMenu).first().click();
  await page.locator(selectors.nav.generalPickupTab).first().click();
  await page.waitForTimeout(1000);
}

// 新增並填寫單一客人;成功回傳 true,失敗回傳 false(不拋出以免中斷整批)
async function addOneCustomer(page, customer) {
  const t = config.run.stepTimeoutMs;
  try {
    // a. 點「新增」產生新空白列
    await page.locator(selectors.table.addButton).first().click();
    await page.waitForTimeout(400);

    // b. 定位到最後一列(剛新增的那列),逐欄填寫
    const rows = page.locator(selectors.table.rows);
    const row = rows.last();
    await row.waitFor({ state: 'visible', timeout: t });

    await fillField(row, selectors.rowFields.customer, customer.name, t);
    // 取件人:保持空白,不填(設計文件第8、10點,絕不可自動填值)
    await fillField(row, selectors.rowFields.address, customer.address, t);
    await fillField(row, selectors.rowFields.time, customer.fixedTime, t);
    await fillField(row, selectors.rowFields.packageCount, config.run.packageCount, t);
    await fillField(row, selectors.rowFields.note, composeSystemNote(customer, config.run.note), t);
    await fillField(row, selectors.rowFields.phone, customer.phone, t);
    await fillField(row, selectors.rowFields.contact, customer.contact, t);

    log.info(`已填寫:${customer.name}`);
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
 * @returns {{filled:object[], fillFailed:object[], confirmed:object[], missing:object[]}}
 */
export async function runRobot(customers) {
  const browser = await chromium.launch({ headless: config.run.headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(config.run.stepTimeoutMs);

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

    // 統一按一次「儲存」
    if (filled.length > 0) {
      log.info(`統一儲存 ${filled.length} 筆 …`);
      await page.locator(selectors.table.saveButton).first().click();
      await page.waitForTimeout(2500); // 等待儲存完成
    } else {
      log.warn('沒有任何成功填寫的列,略過儲存');
    }

    // 反查驗證:以實際系統資料為準(只驗證有成功填寫的那些)
    const { confirmed, missing } = await verifyAgainstSystem(page, filled);

    // 填寫階段就失敗的,也一併算進缺漏(需人工補單)
    const allMissing = [...missing, ...fillFailed];

    return { filled, fillFailed, confirmed, missing: allMissing };
  } catch (e) {
    // 登入 / 導覽等「整批共用步驟」失敗:整批視為缺漏
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
