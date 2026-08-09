// 選擇器校準用「診斷工具」(階段 B 第一步)。
// 只做:登入 GoodMaji → 導覽到代收包裹/一般代取 → 把每一頁的「截圖 + 網頁原始碼」存到 logs/capture/。
// 絕對不會新增、也不會儲存任何取件單,純讀取,安全。
//
// 執行:  node src/capture.js
// 完成後把 logs/capture 整個資料夾壓縮傳回,我依實際頁面結構把 selectors 改準。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { config, ROOT } from './config.js';
import { selectors } from './robot/selectors.js';

const DIR = path.join(ROOT, 'logs', 'capture');
fs.mkdirSync(DIR, { recursive: true });

async function snap(page, tag) {
  try { await page.screenshot({ path: path.join(DIR, `${tag}.png`), fullPage: true }); } catch { /* ignore */ }
  try { fs.writeFileSync(path.join(DIR, `${tag}.html`), await page.content()); } catch { /* ignore */ }
  console.log('已擷取:', tag);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(config.run.stepTimeoutMs);

try {
  console.log('前往登入頁:', config.goodmaji.url);
  await page.goto(config.goodmaji.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await snap(page, '1-login-page');

  // 嘗試登入(best-effort;選擇器不準也沒關係,後面用擷取的原始碼校準)
  try {
    await page.locator(selectors.login.username).first().fill(config.goodmaji.username);
    await page.locator(selectors.login.password).first().fill(config.goodmaji.password);
    await page.locator(selectors.login.submit).first().click();
    await page.waitForTimeout(3000);
  } catch (e) { console.log('登入步驟出錯(可能選擇器要調):', e.message); }
  await snap(page, '2-after-login');

  // 嘗試導覽到 代收包裹 → 一般代取
  try {
    await page.locator(selectors.nav.parcelMenu).first().click();
    await page.waitForTimeout(1500);
    await page.locator(selectors.nav.generalPickupTab).first().click();
    await page.waitForTimeout(2000);
  } catch (e) { console.log('導覽步驟出錯(可能選擇器要調):', e.message); }
  await snap(page, '3-pickup-page');

  console.log('\n完成 ✅ 請把 logs/capture 資料夾壓縮後傳回。');
} catch (e) {
  console.error('擷取過程發生錯誤:', e.message);
  await snap(page, 'error');
} finally {
  await browser.close();
}
