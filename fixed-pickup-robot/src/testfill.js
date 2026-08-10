// 安全測試(階段 B):只登入 → 新增一筆 → 填欄位 → 截圖,【絕不按儲存】。
// 用途:讓你先確認每個欄位都填對位置、內容正確,再進入真正建單。
//
// 執行:  node src/testfill.js   (或 npm run testfill)
// 完成後把 logs/capture/5-filled.png 傳回檢視。
import { log } from './logger.js';
import { getStore } from './datastore/index.js';
import { runRobot } from './robot/index.js';

const store = getStore();
const customers = await store.listCustomers();
const active = customers.filter((c) => c.status === 'active');
const pick = active.length ? active.slice(0, 1) : customers.slice(0, 1);

if (pick.length === 0) {
  log.error('資料庫沒有任何客人,請先用表單或後台新增至少一位客人,再跑這個測試。');
  process.exit(1);
}

log.info(`【安全測試】只填一筆、不儲存:${pick[0].name}`);
await runRobot(pick, { noSave: true });
log.info('完成。請把 logs/capture/5-filled.png 傳回給我檢視是否填對。');
process.exit(0);
