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
  // ---- 登入頁(三欄:編號 / 帳號 / 密碼)。依實際頁面 login.aspx 的欄位 ID ----
  login: {
    code: '#number',        // 第一欄「編號」   <input id="number">
    username: '#account',   // 第二欄「帳號」   <input id="account">
    password: '#password',  // 第三欄「密碼」   <input id="password">
    submit: '#SignIn',      // 登入鈕           <input id="SignIn" value="signin">
    // 登入成功後應會出現的元素(用來確認登入完成)
    successMarker: 'text=代收包裹',
  },

  // ---- 「代收包裹 → 一般代取」內層頁 collection.aspx ----
  // 直接以登入後同 session 導覽到此頁(見 robot/index.js gotoGeneralPickup)
  nav: {
    // collection.aspx?method=get(相對於 GOODMAJI_URL 的目錄)
    collectionPath: 'collection.aspx?method=get',
  },

  // ---- 新增列 / 表格(一般代取 = ASP.NET Repeater "rp1")----
  table: {
    addButton: '#linkAdd',   // <a id="linkAdd">新增</a>(按下會 postback 產生新空白列)
    saveButton: '#btnSave',  // <input id="btnSave" value="儲存">
    // 每列的「客戶」欄輸入框,用來數列數 / 找出剛新增的空白列
    rows: 'input[id^="rp1_keyword_"]',
  },

  // ---- 單一列各欄位:實際 id 為 `rp1_<欄位>_<列索引>`,程式會依索引組合 ----
  // 這裡放「欄位代號」,robot/index.js 會組成 #rp1_<代號>_<N>
  rowFields: {
    customer: 'keyword',           // 客戶(輸入會員名稱)
    receiver: 'txtReciveMember',   // 取件人(依業務規則:留空白,不填)
    address: 'addr',               // 地址
    date: 'litDate',               // 日期(MM/DD)
    time: 'litTime',               // 時間(HH:MM)
    packageCount: 'packingCount',  // 包裹數
    note: 'pickupRemark',          // 備註
    phone: 'contactTel',           // 電話
    contact: 'contactPerson',      // 聯絡人
  },

  // ---- 反查驗證:讀取當天清單各列的客戶名 ----
  verify: {
    // 讀每一列「客戶」欄的值來比對是否新增成功
    customerInputs: 'input[id^="rp1_keyword_"]',
  },
};
