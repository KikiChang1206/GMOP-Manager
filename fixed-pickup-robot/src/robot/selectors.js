// ============================================================
// 網站選擇器集中管理
// ============================================================
// 重要:這些選擇器是「依設計文件描述」預先寫好的合理猜測。
// 由於 system.goodmaji.com 需登入且會改版,首次實跑時請務必:
//   1. 用 HEADLESS=0 開瀏覽器,對照實際頁面
//   2. 逐一調整下方選擇器直到穩定
//   3. 建議優先用「文字定位」(getByText / getByRole)而非脆弱的 CSS class
//
// 全部集中在這一個檔案,之後網站改版只要改這裡,不用動流程邏輯。
// ============================================================

export const selectors = {
  // ---- 登入頁(三欄:編號 / 帳號 / 密碼)----
  login: {
    code: 'input[placeholder="編號"]',                                  // 第一欄「編號」
    username: 'input[placeholder="Account"], input[name="username"]',   // 第二欄「帳號 / Account」
    password: 'input[placeholder="Password"], input[type="password"]',  // 第三欄「密碼」
    submit: 'input[value="signin" i], button:has-text("signin"), input[type="submit"], button[type="submit"]',
    // 登入成功後應會出現的元素(用來確認登入完成)
    successMarker: 'text=代收包裹',
  },

  // ---- 導覽到「代收包裹」→「一般代取」 ----
  nav: {
    parcelMenu: 'text=代收包裹',
    generalPickupTab: 'text=一般代取',
  },

  // ---- 新增列 / 表格 ----
  table: {
    addButton: 'button:has-text("新增")',
    saveButton: 'button:has-text("儲存")',
    // 新增後出現的資料列(以最後一列為剛新增的那列)
    rows: 'table tbody tr',
  },

  // ---- 單一列裡各欄位的輸入框(相對於該列 <tr>)----
  // 這些多半是 nth 欄位或帶 name/placeholder。請對照實際 DOM 調整。
  rowFields: {
    customer: 'input[placeholder*="客戶"], td:nth-child(1) input',
    picker: 'input[placeholder*="取件人"], td:nth-child(2) input', // 保持空白,不填
    address: 'input[placeholder*="地址"], td:nth-child(3) input',
    time: 'input[placeholder*="時間"], td:nth-child(4) input',
    packageCount: 'input[placeholder*="件"], td:nth-child(5) input',
    note: 'input[placeholder*="備註"], textarea[placeholder*="備註"], td:nth-child(6) input',
    phone: 'input[placeholder*="電話"], td:nth-child(7) input',
    contact: 'input[placeholder*="聯絡人"], td:nth-child(8) input',
  },

  // ---- 反查驗證:查詢當天清單 ----
  verify: {
    // 查詢當天資料的方式因網站而異。常見:日期篩選 + 查詢按鈕。
    queryButton: 'button:has-text("查詢")',
    // 撈回清單後,用來讀每一列文字做比對的容器
    resultRows: 'table tbody tr',
  },
};
