// 每日排程進入點(cron 目標)。
// 流程(設計文件第5節):
//   1. 讀客人設定,篩出今天要新增的清單
//   2. 跑 Playwright 新增 + 儲存 + 反查驗證
//   3. 每筆結果寫進執行記錄
//   4. 發送彙總通知(每天都發)
//
// 手動測試:
//   node src/run.js            正式跑
//   DRY_RUN=1 node src/run.js  只印出「今天要處理誰」,不開瀏覽器、不寫入
import { config } from './config.js';
import { log } from './logger.js';
import { getStore } from './datastore/index.js';
import { selectDueCustomers, localDateStr } from './schedule.js';
import { runRobot } from './robot/index.js';
import { notify } from './notify.js';

// 計算「連續缺漏 2 天以上」的客人(設計文件第7節補充機制)
function findConsecutiveMisses(logs, todayMissing, dateStr) {
  const yesterday = (() => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return localDateStr(d);
  })();
  const missedYesterday = new Set(
    logs
      .filter((l) => l.runDate === yesterday && l.result !== '成功')
      .map((l) => l.customer_id),
  );
  return todayMissing
    .filter((m) => missedYesterday.has(m.customer_id))
    .map((m) => ({ name: m.name, days: 2 })); // 至少連續 2 天
}

async function main() {
  const store = getStore();
  const now = new Date();
  const dateStr = localDateStr(now);
  log.info(`===== 固定取件機器人啟動 ${dateStr}(後端:${config.datastore})=====`);

  // 1. 篩選今天要處理的客人
  const customers = await store.listCustomers();
  const due = selectDueCustomers(customers, now);
  log.info(`今天符合排程的客人:${due.length} 位`);

  if (due.length === 0) {
    log.info('今天沒有需要新增的客人,仍發送空通知讓你安心確認。');
    await notify({ dateStr, planned: [], confirmed: [], missing: [] });
    return;
  }

  // DRY_RUN:只印清單,不動系統(方便先確認排程邏輯正確)
  if (config.run.dryRun) {
    log.info('【DRY_RUN】僅列出今天要處理的客人,不會開瀏覽器、不寫入:');
    due.forEach((c) => log.info(`  - ${c.name} / ${c.address} / ${c.fixedTime}`));
    return;
  }

  // 2. 跑機器人
  const { confirmed, missing } = await runRobot(due);

  // 3. 寫執行記錄(每一位都寫,方便追蹤/除錯)
  const timestamp = new Date().toISOString();
  for (const c of confirmed) {
    await store.appendLog({
      runDate: dateStr, customer_id: c.customer_id, name: c.name,
      result: '成功', errorReason: '', timestamp,
    });
  }
  for (const m of missing) {
    await store.appendLog({
      runDate: dateStr, customer_id: m.customer_id, name: m.name,
      result: '失敗', errorReason: `${m.reason || '未確認'}(待人工補單)`, timestamp,
    });
  }

  // 4. 彙總通知(含連續缺漏提醒)
  const logs = await store.listLogs();
  const consecutiveMisses = findConsecutiveMisses(logs, missing, dateStr);
  await notify({ dateStr, planned: due, confirmed, missing, consecutiveMisses });

  log.info(`===== 完成:成功 ${confirmed.length} / 缺漏 ${missing.length} =====`);
}

main().catch(async (e) => {
  // 連 main 都掛掉也要想辦法通知,不能靜默失敗
  log.error('主流程未捕捉的例外:', e.stack || e.message);
  try {
    await notify({
      dateStr: localDateStr(),
      planned: [],
      confirmed: [],
      missing: [{ name: '(系統)', address: '主流程異常', reason: e.message }],
    });
  } catch { /* ignore */ }
  process.exit(1);
});
