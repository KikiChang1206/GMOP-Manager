// 客人資料模型 + 每日排程篩選邏輯(設計文件第5節)。
// 這裡都是純函式,不碰 I/O,方便單獨測試。

// 星期以 1=週一 ... 7=週日 表示(對應設計文件「1,3,5」= 週一三五)。
export const WEEKDAY_LABELS = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

// 把 JS 的 Date.getDay()(0=週日..6=週六)轉成 1=週一..7=週日
export function isoWeekday(date) {
  return ((date.getDay() + 6) % 7) + 1;
}

// 以「當地日期」為準取 YYYY-MM-DD,避免 UTC 位移把日期算錯一天。
export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 解析頻率星期字串 "1,3,5" -> [1,3,5]
export function parseWeekdays(str) {
  return (str || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => n >= 1 && n <= 7);
}

/**
 * 判斷「某位客人今天是否要新增取件單」。
 * @param {object} c   一筆客人設定(欄位見 README 資料結構)
 * @param {Date}   now 當下時間(預設現在;測試時可注入固定日期)
 */
export function isDueToday(c, now = new Date()) {
  // 1) 狀態必須為啟用
  if (c.status !== 'active') return false;

  // 2) 今天 >= 生效日期
  const today = localDateStr(now);
  if (c.effectiveDate && today < c.effectiveDate) return false;

  // 3) 頻率條件
  if (c.frequencyType === 'daily') return true;
  if (c.frequencyType === 'weekly') {
    return parseWeekdays(c.weekdays).includes(isoWeekday(now));
  }
  return false;
}

// 從全部客人中挑出今天要處理的清單
export function selectDueCustomers(customers, now = new Date()) {
  return customers.filter((c) => isDueToday(c, now));
}

// 產生一筆客人設定的預設骨架(表單送出時用)
export function newCustomerRecord(input) {
  return {
    customer_id: input.customer_id,
    name: (input.name || '').trim(),
    address: (input.address || '').trim(),
    fixedTime: (input.fixedTime || '').trim(),
    phone: (input.phone || '').trim(),
    contact: (input.contact || '').trim(),
    frequencyType: input.frequencyType === 'daily' ? 'daily' : 'weekly',
    weekdays: input.frequencyType === 'daily' ? '' : parseWeekdays(input.weekdays).join(','),
    effectiveDate: (input.effectiveDate || '').trim(),
    customerNote: (input.customerNote || '').trim(),
    status: 'active', // 系統自動預設啟用(設計文件第3節)
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

// 表單/API 進來的資料驗證,回傳錯誤訊息陣列(空陣列=通過)
export function validateCustomer(input) {
  const errors = [];
  const need = {
    name: '客戶名稱',
    address: '地址',
    fixedTime: '固定取件時間',
    phone: '電話',
    contact: '聯絡人',
    effectiveDate: '生效日期',
  };
  for (const [k, label] of Object.entries(need)) {
    if (!input[k] || !String(input[k]).trim()) errors.push(`「${label}」為必填`);
  }
  if (input.fixedTime && !/^\d{1,2}:\d{2}$/.test(input.fixedTime.trim())) {
    errors.push('固定取件時間格式需為 HH:mm(例如 14:00)');
  }
  if (input.effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate.trim())) {
    errors.push('生效日期格式需為 YYYY-MM-DD');
  }
  if (input.frequencyType !== 'daily' && parseWeekdays(input.weekdays).length === 0) {
    errors.push('取件頻率為每週時,至少要選一個星期');
  }
  return errors;
}

// 組出寫進系統備註欄的文字:固定「件數確認中」+ 客人自訂備註(設計文件第8節)
export function composeSystemNote(customer, defaultNote) {
  const base = defaultNote || '件數確認中';
  const extra = (customer.customerNote || '').trim();
  return extra ? `${base} / ${extra}` : base;
}
