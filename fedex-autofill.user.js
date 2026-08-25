// ==UserScript==
// @name         好馬吉 → FedEx 建立貨件 自動填入
// @namespace    goodmaji.gmop
// @version      1.0.0
// @description  在好馬吉訂單頁抓取寄/收件資料，切到 FedEx 建立貨件頁一鍵自動填入。寄件人姓名/公司用客人的，寄件地址/電話用好馬吉五股倉固定值。
// @match        *://*.fedex.com/*
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
  使用方式
  ────────────────────────────────────────────────────────
  1. 安裝 Tampermonkey（Chrome/Edge 擴充功能），把本檔內容貼進新腳本後儲存。
  2. 打開「好馬吉」訂單頁，右下角會出現藍色小面板 →  按【① 抓取本張訂單】。
     （資料會複製到剪貼簿，也會存在瀏覽器裡）
  3. 打開「FedEx 建立貨件」頁，右下角面板 →  按【② 自動填入 FedEx】。
  4. 填完後務必自己核對一次「服務 / 幣別 / 報關 / 品項」等 FedEx 必填，再送出。

  ▲ 若某欄沒填到：多半是該頁 DOM 的標籤文字和腳本設定不同。
    打開瀏覽器 Console 會看到「找不到欄位: xxx」的訊息，把訊息貼給我即可微調。
*/

(function () {
  'use strict';

  /* =========================================================================
   * 一、固定值設定（好馬吉五股倉 = FedEx 寄件地固定資料）
   *    以後倉庫地址/電話有變，只要改這一區。
   * =======================================================================*/
  const FIXED_SENDER = {
    phone: '0277309898',
    email: 'gmcs@goodmaji.com',
    country: 'Taiwan',        // FedEx 國家/地區下拉顯示文字
    line1: '1F., No. 18, Wuquan 7th Rd.,',
    line2: 'Wugu Dist.,',
    postalCode: '248020',
    city: 'New Taipei City',
    residential: false,      // 「這是住宅地址」不勾
  };

  /* =========================================================================
   * 二、欄位對應設定
   *    key   = 我們內部欄位名
   *    label = 該系統畫面上的欄位標籤文字（用來定位輸入框，比 id 穩定）
   * =======================================================================*/

  // 好馬吉 Step1 抓取用：收件人資訊 / 寄件人資訊 兩欄各自的標籤
  const GM_RECIPIENT_LABELS = {
    name: ['姓名'],
    company: ['公司名稱'],
    phone: ['聯絡方式1', '聯絡方式１'],
    email: ['E-mail', 'Email', 'E-Mail'],
    country: ['國別'],
    region: ['區域'],
    postalCode: ['郵編', '郵遞區號'],
    address: ['地址'],
  };
  const GM_SENDER_LABELS = {
    name: ['姓名'],
    nameEn: ['英文姓名'],
    company: ['公司名稱'],
    country: ['國別'],
    postalCode: ['郵編'],
    address: ['地址'],
  };

  // FedEx 寄件地 / 收件地 卡片內的欄位標籤（floating label 文字）
  const FEDEX_LABELS = {
    contactName: ['聯絡人姓名', 'Contact name'],
    company: ['公司', 'Company'],
    taxId: ['州/省貨物稅識別碼', 'TAX ID', 'I.E.'],
    phone: ['電話號碼', 'Phone number'],
    ext: ['電話分機', 'Extension'],
    email: ['電子郵件', 'E-mail', 'Email'],
    country: ['國家/地區', 'Country/Territory'],
    line1: ['地址行 1', '地址行1', 'Address line 1'],
    line2: ['地址行 2', '地址行2', 'Address line 2'],
    line3: ['地址行 3', '地址行3', 'Address line 3'],
    postalCode: ['郵遞區號', 'Postal code', 'ZIP'],
    city: ['城市', 'City'],
    state: ['州', '省', 'State', 'Province'],
    residential: ['這是住宅地址', 'residential'],
  };

  // 國別代碼 → FedEx 國家下拉顯示文字（常用；不夠再補）
  const COUNTRY_MAP = {
    US: 'United States', 'US(美國)': 'United States', 美國: 'United States',
    TW: 'Taiwan', 'TW(臺灣)': 'Taiwan', 臺灣: 'Taiwan', 台灣: 'Taiwan',
    JP: 'Japan', 日本: 'Japan',
    CN: 'China', 中國: 'China',
    HK: 'Hong Kong SAR, China', 香港: 'Hong Kong SAR, China',
    GB: 'United Kingdom', UK: 'United Kingdom', 英國: 'United Kingdom',
    CA: 'Canada', 加拿大: 'Canada',
    AU: 'Australia', 澳洲: 'Australia',
    DE: 'Germany', 德國: 'Germany',
    FR: 'France', 法國: 'France',
    KR: 'South Korea', 韓國: 'South Korea',
    SG: 'Singapore', 新加坡: 'Singapore',
  };

  const STORE_KEY = 'gmop_fedex_payload';

  /* =========================================================================
   * 三、共用工具
   * =======================================================================*/
  const norm = (s) => (s || '').replace(/\s+/g, ' ').replace(/[：:*＊]/g, '').trim();

  // 用「原生 setter + input/change 事件」寫值，才能觸發 React/Angular 的受控更新
  function setNativeValue(el, value) {
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    el.focus();
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  // 在 root 範圍內，依標籤文字找到對應的輸入框 / select
  function findFieldByLabel(root, labelTexts) {
    const labels = labelTexts.map(norm);
    // 1) <label for=id>
    for (const lab of root.querySelectorAll('label')) {
      if (labels.includes(norm(lab.textContent))) {
        const forId = lab.getAttribute('for');
        if (forId) {
          const byId = root.querySelector(`#${CSS.escape(forId)}`) || document.getElementById(forId);
          if (byId) return byId;
        }
        const inside = lab.querySelector('input,select,textarea');
        if (inside) return inside;
      }
    }
    // 2) 任何元素文字 === 標籤，往上找容器再抓 input（floating label / span 標籤）
    const all = root.querySelectorAll('label,span,div,legend,p');
    for (const node of all) {
      const t = norm(node.childNodes.length ? node.textContent : node.textContent);
      if (!labels.includes(t)) continue;
      let box = node;
      for (let i = 0; i < 4 && box; i++) {
        const f = box.querySelector('input:not([type=hidden]),select,textarea');
        if (f) return f;
        box = box.parentElement;
      }
    }
    // 3) aria-label / placeholder 後備
    for (const lab of labels) {
      const f = root.querySelector(
        `input[aria-label="${lab}"],input[placeholder="${lab}"],textarea[aria-label="${lab}"]`
      );
      if (f) return f;
    }
    return null;
  }

  // 找到含指定標題文字的卡片容器（用來把「寄件地/收件地」分開）
  function findSection(headerTexts) {
    const heads = headerTexts.map(norm);
    const nodes = document.querySelectorAll('h1,h2,h3,h4,legend,div,span,button');
    for (const n of nodes) {
      if (heads.includes(norm(n.textContent))) {
        // 往上找一個夠大的容器
        let box = n;
        for (let i = 0; i < 6 && box.parentElement; i++) {
          box = box.parentElement;
          if (box.querySelectorAll('input,select').length >= 3) return box;
        }
        return n.parentElement || n;
      }
    }
    return null;
  }

  function toast(msg, ok = true) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', right: '16px', bottom: '90px', zIndex: 999999,
      background: ok ? '#0b6b3a' : '#a11', color: '#fff', padding: '10px 14px',
      borderRadius: '10px', font: '14px/1.4 system-ui', maxWidth: '320px',
      boxShadow: '0 6px 20px rgba(0,0,0,.25)', whiteSpace: 'pre-wrap',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  /* =========================================================================
   * 四、好馬吉：抓取 Step1 收件人/寄件人資料
   * =======================================================================*/
  function readGroup(sectionEl, labelMap) {
    const out = {};
    if (!sectionEl) return out;
    for (const [key, labels] of Object.entries(labelMap)) {
      const f = findFieldByLabel(sectionEl, labels);
      out[key] = f ? (f.value || '').trim() : '';
    }
    return out;
  }

  function scrapeGoodMaji() {
    // 收件人資訊 / 寄件人資訊 兩個區塊
    const recSection = findSection(['收件人資訊', '收件人']);
    const sndSection = findSection(['寄件人資訊', '寄件人']);
    const recipient = readGroup(recSection, GM_RECIPIENT_LABELS);
    const sender = readGroup(sndSection, GM_SENDER_LABELS);

    if (!recipient.name && !recipient.address) {
      toast('抓不到收件人資料。\n請確認在好馬吉訂單頁（Step1 已展開）。', false);
      return null;
    }

    const payload = {
      _from: 'goodmaji',
      _at: new Date().toISOString(),
      // 寄件地：姓名/公司用客人的（好馬吉寄件人），其餘用固定值
      shipFrom: {
        contactName: sender.name || sender.nameEn || '',
        company: sender.nameEn || sender.company || '',
        ...FIXED_SENDER,
      },
      // 收件地：全部用好馬吉收件人
      shipTo: buildShipTo(recipient),
      raw: { recipient, sender },
    };

    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    copyToClipboard(JSON.stringify(payload));
    toast('✅ 已抓取並複製：\n收件人 ' + (recipient.name || '?') +
          '\n請到 FedEx 頁按【② 自動填入】');
    console.log('[GMOP→FedEx] payload', payload);
    return payload;
  }

  // 把好馬吉單一地址欄拆成 FedEx 需要的 街道/城市/州/國家
  function buildShipTo(rec) {
    const country = COUNTRY_MAP[norm(rec.country)] || rec.country || '';
    const parsed = parseAddress(rec.address, country);
    return {
      contactName: rec.name || '',
      company: rec.company || '',
      phone: rec.phone || '',
      email: rec.email || '',
      country,
      postalCode: rec.postalCode || parsed.postalCode || '',
      line1: parsed.line1 || rec.address || '',
      line2: parsed.line2 || '',
      city: parsed.city || '',
      state: parsed.state || '',
      residential: false,
    };
  }

  // 逗號拆解：最後段=國家、倒數第二=州、再前面=城市、其餘=街道
  function parseAddress(addr, country) {
    const res = { line1: '', line2: '', city: '', state: '', postalCode: '' };
    if (!addr) return res;
    let parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
    // 去掉結尾的國家字樣
    const countryWords = ['United States of America', 'United States', 'USA', 'U.S.A.',
      'Taiwan', 'R.O.C.', 'Taiwan (R.O.C.)'];
    while (parts.length && countryWords.some((c) =>
      parts[parts.length - 1].toLowerCase().includes(c.toLowerCase()))) {
      parts.pop();
    }
    if (parts.length >= 3) {
      res.state = parts.pop();
      res.city = parts.pop();
      res.line1 = parts.shift() || '';
      res.line2 = parts.join(', ');
    } else if (parts.length === 2) {
      res.city = parts.pop();
      res.line1 = parts.join(', ');
    } else {
      res.line1 = parts.join(', ');
    }
    return res;
  }

  /* =========================================================================
   * 五、FedEx：把資料填進「寄件地 / 收件地」
   * =======================================================================*/
  function loadPayload() {
    // 先試剪貼簿，失敗改用 localStorage
    return navigator.clipboard.readText()
      .then((txt) => {
        try { const p = JSON.parse(txt); if (p && p._from === 'goodmaji') return p; } catch (e) {}
        return JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      })
      .catch(() => JSON.parse(localStorage.getItem(STORE_KEY) || 'null'));
  }

  function fillGroup(section, data, missing) {
    if (!section) return;
    const put = (key, val) => {
      if (val === undefined || val === '' || val === null) return;
      const f = findFieldByLabel(section, FEDEX_LABELS[key]);
      if (!f) { missing.push(key); return; }
      if (f.tagName === 'SELECT') {
        selectByText(f, val);
      } else if (f.type === 'checkbox') {
        if (!!f.checked !== !!val) f.click();
      } else {
        setNativeValue(f, val);
      }
    };
    put('contactName', data.contactName);
    put('company', data.company);
    put('phone', data.phone);
    put('email', data.email);
    put('country', data.country);
    put('line1', data.line1);
    put('line2', data.line2);
    put('line3', data.line3);
    put('postalCode', data.postalCode);
    put('city', data.city);
    put('state', data.state);
  }

  function selectByText(sel, text) {
    const want = norm(text).toLowerCase();
    for (const o of sel.options) {
      if (norm(o.textContent).toLowerCase() === want) { sel.value = o.value; break; }
    }
    // 沒完全相等就找包含
    if (norm(sel.selectedOptions[0]?.textContent).toLowerCase() !== want) {
      for (const o of sel.options) {
        if (norm(o.textContent).toLowerCase().includes(want)) { sel.value = o.value; break; }
      }
    }
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function fillFedEx() {
    const payload = await loadPayload();
    if (!payload) {
      toast('沒有資料。請先到好馬吉頁按【① 抓取】。', false);
      return;
    }
    const fromSec = findSection(['寄件地', 'From', 'Ship from']);
    const toSec = findSection(['收件地', 'To', 'Ship to']);
    const missing = [];
    fillGroup(fromSec, payload.shipFrom, missing);
    fillGroup(toSec, payload.shipTo, missing);

    const who = payload.shipTo?.contactName || '';
    if (missing.length) {
      toast('⚠️ 已填入，但這些欄位沒對到：\n' + [...new Set(missing)].join('、') +
            '\n（其餘已填，請手動補並核對）', false);
      console.warn('[GMOP→FedEx] 找不到欄位:', missing);
    } else {
      toast('✅ 已填入 FedEx（收件人 ' + who + '）\n請核對服務/幣別/報關後送出');
    }
  }

  /* =========================================================================
   * 六、剪貼簿 & UI 面板
   * =======================================================================*/
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  function isFedEx() {
    return /fedex\.com$/.test(location.hostname) || /fedex\.com/.test(location.hostname);
  }

  function buildPanel() {
    if (document.getElementById('gmop-fedex-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'gmop-fedex-panel';
    Object.assign(panel.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: 999999,
      display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch',
      font: '13px system-ui',
    });
    const mkBtn = (label, bg, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        background: bg, color: '#fff', border: 'none', padding: '10px 14px',
        borderRadius: '10px', cursor: 'pointer', fontWeight: '600',
        boxShadow: '0 4px 14px rgba(0,0,0,.2)',
      });
      b.onclick = fn;
      return b;
    };

    const onFedEx = isFedEx();
    // 兩個按鈕都放上去，讓使用者不用管腳本判斷對不對
    panel.appendChild(mkBtn('① 抓取本張訂單（好馬吉）', '#2b6cb0', scrapeGoodMaji));
    panel.appendChild(mkBtn('② 自動填入 FedEx', '#0b6b3a', fillFedEx));
    document.body.appendChild(panel);
  }

  // 頁面就緒後掛上面板（SPA 會重繪，定時確保存在）
  buildPanel();
  setInterval(buildPanel, 3000);
})();
