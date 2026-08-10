// 反查驗證(設計文件第7節)—— 防漏關鍵步驟。
// 不信任「腳本沒報錯」= 成功;一律重新查詢系統實際資料來比對。
import { selectors } from './selectors.js';
import { log } from '../logger.js';

// 正規化字串以利比對(去空白、全形轉半形空白等)
function norm(s) {
  return (s || '').replace(/\s+/g, '').trim();
}

/**
 * 重新查詢當天清單,與「原本預計新增的客人」逐一比對。
 * 比對依據:客戶名稱 + 地址(兩者相符才算確認成功)。
 * @returns {{confirmed: object[], missing: object[]}}
 */
export async function verifyAgainstSystem(page, plannedCustomers) {
  let systemText = '';
  try {
    // 儲存後頁面會重新載入並顯示當天清單;讀取每列「客戶」「地址」欄的實際值來比對
    systemText = await page.evaluate((sel) => {
      const vals = [];
      document.querySelectorAll(sel).forEach((e) => vals.push(e.value || ''));
      // 一併讀地址欄
      document.querySelectorAll('input[id^="rp1_addr_"]').forEach((e) => vals.push(e.value || ''));
      return vals.join('\n');
    }, selectors.verify.customerInputs);
  } catch (e) {
    // 查詢本身失敗:保守起見,全部視為「無法確認」= 缺漏,提醒人工檢查
    log.error('反查查詢失敗,全部標記為待人工確認', e.message);
    return {
      confirmed: [],
      missing: plannedCustomers.map((c) => ({
        ...c,
        reason: '反查查詢失敗,無法確認,請人工檢查',
      })),
    };
  }

  const confirmed = [];
  const missing = [];
  for (const c of plannedCustomers) {
    const nameHit = systemText.includes(norm(c.name));
    const addrHit = systemText.includes(norm(c.address));
    if (nameHit && addrHit) {
      confirmed.push(c);
    } else {
      missing.push({
        ...c,
        reason: !nameHit && !addrHit ? '系統查無此筆' : '名稱或地址不符',
      });
    }
  }
  return { confirmed, missing };
}
