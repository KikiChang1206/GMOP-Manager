// 真實建單測試(階段 B 最後一步):登入 → 新增一筆 → 填欄位 →【真的按儲存】→ 反查驗證。
// 只處理「後台第一位啟用的客人」一筆,方便你核對。會在 GoodMaji 建立一筆真實資料,
// 測試完可自行到 GoodMaji 刪除該列。
//
// 執行:  node src/testsave.js   (或 npm run testsave)
import { log } from './logger.js';
import { getStore } from './datastore/index.js';
import { runRobot } from './robot/index.js';

const store = getStore();
const customers = await store.listCustomers();
const active = customers.filter((c) => c.status === 'active');
const pick = active.length ? active.slice(0, 1) : customers.slice(0, 1);

if (pick.length === 0) {
  log.error('資料庫沒有任何客人,請先新增一位再測試。');
  process.exit(1);
}

log.warn(`【真實建單測試】即將在 GoodMaji 建立 1 筆:${pick[0].name} / ${pick[0].address}`);
const r = await runRobot(pick, { noSave: false });

log.info('──────── 結果 ────────');
log.info(`成功確認:${r.confirmed.length} 筆`);
r.confirmed.forEach((c) => log.info(`  ✅ ${c.name}`));
if (r.missing.length) {
  log.warn(`未確認/缺漏:${r.missing.length} 筆`);
  r.missing.forEach((m) => log.warn(`  ⚠️ ${m.name} — ${m.reason || ''}`));
}
log.info('請到 GoodMaji「一般代取」核對這筆,並檢視 logs/capture/6-saved.png。測試資料可自行刪除。');
process.exit(0);
