// 選擇器校準用「診斷工具」(階段 B)。
// 只做:登入 GoodMaji → 判斷是否登入成功 → 若成功則導覽到代收包裹/一般代取 →
//       把每一頁的「截圖 + 網頁原始碼」存到 logs/capture/。
// 絕對不會新增、也不會儲存任何取件單,純讀取,安全。
//
// 執行:  node src/capture.js   (或 npm run capture)
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

// 攔截網頁彈出訊息(例如登入失敗的 alert「密碼錯誤」),印出來方便診斷
const dialogs = [];
page.on('dialog', async (d) => {
  dialogs.push(d.message());
  console.log('⚠️ 網頁彈出訊息:', d.message());
  try { await d.dismiss(); } catch { /* ignore */ }
});

try {
  console.log('前往登入頁:', config.goodmaji.url);
  await page.goto(config.goodmaji.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await snap(page, '1-login-page');

  // 填入三欄並送出(編號 / 帳號 / 密碼)
  try {
    await page.locator(selectors.login.code).first().fill(config.goodmaji.code);
    await page.locator(selectors.login.username).first().fill(config.goodmaji.username);
    await page.locator(selectors.login.password).first().fill(config.goodmaji.password);
    await page.locator(selectors.login.submit).first().click();
    await page.waitForTimeout(3500);
  } catch (e) { console.log('登入步驟出錯(選擇器可能要調):', e.message); }
  await snap(page, '2-after-login');

  // 判斷登入結果
  const stillOnLogin = await page.locator(selectors.login.password).first().isVisible().catch(() => false);
  const hasError = dialogs.some((m) => /密碼|錯誤|帳號|失敗|error/i.test(m));

  console.log('\n──────── 登入結果 ────────');
  console.log('目前網址:', page.url());
  if (hasError) {
    console.log('❌ 登入失敗:網頁回報「' + dialogs.join(' / ') + '」');
    console.log('   → 請檢查 .env 的 GOODMAJI_CODE(編號)/ USERNAME(帳號)/ PASSWORD(密碼)是否正確。');
    console.log('   → 密碼若含 # 或空格等特殊符號,請在 .env 用單引號包起來,例如 GOODMAJI_PASSWORD=\'你的密碼\'');
  } else if (stillOnLogin) {
    console.log('❌ 登入後仍停在登入頁(帳密可能有誤,或需要其他步驟)。');
  } else {
    console.log('✅ 登入成功!');
  }
  console.log('──────────────────────────\n');

  // 只有登入成功才嘗試導覽到「代收包裹 → 一般代取」
  if (!hasError && !stillOnLogin) {
    try {
      await page.locator(selectors.nav.parcelMenu).first().click();
      await page.waitForTimeout(1500);
      await page.locator(selectors.nav.generalPickupTab).first().click();
      await page.waitForTimeout(2000);
      console.log('已嘗試導覽到 代收包裹 → 一般代取');
    } catch (e) { console.log('導覽步驟出錯(選單選擇器待校準):', e.message); }
  }
  await snap(page, '3-pickup-page');

  console.log('\n完成 ✅ 若上面顯示登入成功,請把 logs/capture 壓縮傳回校準;若失敗,先修正 .env 再重跑。');
} catch (e) {
  console.error('擷取過程發生錯誤:', e.message);
  await snap(page, 'error');
} finally {
  await browser.close();
}
