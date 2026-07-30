/**
 * 心情日記本 - Google Apps Script 後端
 *
 * 試算表需要五個分頁：
 * 1. 「留言板」  → id / 姓名 / 帳號 / 日期 / 內容 / 建立時間 / 回覆 / 回覆時間 / 回覆者
 * 2. 「帳號」    → 姓名 / 帳號 / 權限（填「大樹」或「小樹苗」）
 * 3. 「大樹信件」→ id / 發送者姓名 / 發送者帳號 / 收件者帳號 / 內容 / 建立時間
 * 4. 「對話紀錄」→ id / threadId / 發言者姓名 / 發言者帳號 / 內容 / 建立時間  ← 新增
 * 5. 「公開留言板」→ id / 發言者姓名 / 發言者帳號 / 內容 / 建立時間           ← 新增
 *
 * 部署：「部署」→「管理部署作業」→ 鉛筆 → 版本選「新版本」→ 部署
 */

var SHEET_NAME        = '留言板';
var ACCOUNT_SHEET_NAME = '帳號';
var MESSAGE_SHEET_NAME = '大樹信件';
var THREAD_SHEET_NAME  = '對話紀錄';
var PUBLIC_SHEET_NAME  = '公開留言板';

function getSheet()        { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME); }
function getAccountSheet() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCOUNT_SHEET_NAME); }
function getMessageSheet() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MESSAGE_SHEET_NAME); }
function getThreadSheet()  { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(THREAD_SHEET_NAME); }
function getPublicSheet()  { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PUBLIC_SHEET_NAME); }

// 留言板：id / 姓名 / 帳號 / 日期 / 內容 / 建立時間 / 回覆 / 回覆時間 / 回覆者
function rowToEntry(row) {
  return {
    id: String(row[0]),
    author: String(row[1]),
    account: String(row[2]),
    entryDate: row[3] instanceof Date
      ? Utilities.formatDate(row[3], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(row[3]),
    content: String(row[4]),
    createdAt: row[5] instanceof Date ? row[5].toISOString() : String(row[5]),
    reply: row[6] ? String(row[6]) : '',
    repliedAt: row[7] ? (row[7] instanceof Date ? row[7].toISOString() : String(row[7])) : '',
    replyBy: row[8] ? String(row[8]) : ''
  };
}

// 大樹信件：id / 發送者姓名 / 發送者帳號 / 收件者帳號 / 內容 / 建立時間
function rowToMessage(row) {
  return {
    id: String(row[0]),
    fromName: String(row[1]),
    fromAccount: String(row[2]),
    toAccount: String(row[3]),
    content: String(row[4]),
    createdAt: row[5] instanceof Date ? row[5].toISOString() : String(row[5])
  };
}

// 對話紀錄：id / threadId / 發言者姓名 / 發言者帳號 / 內容 / 建立時間
function rowToThreadMsg(row) {
  return {
    id: String(row[0]),
    threadId: String(row[1]),
    fromName: String(row[2]),
    fromAccount: String(row[3]),
    content: String(row[4]),
    createdAt: row[5] instanceof Date ? row[5].toISOString() : String(row[5])
  };
}

// 公開留言板：id / 發言者姓名 / 發言者帳號 / 內容 / 建立時間
function rowToPublicPost(row) {
  return {
    id: String(row[0]),
    fromName: String(row[1]),
    fromAccount: String(row[2]),
    content: String(row[3]),
    createdAt: row[4] instanceof Date ? row[4].toISOString() : String(row[4])
  };
}

// 帳號分頁：姓名 / 帳號 / 權限（大小寫不分）
function getAccount(account) {
  var sheet = getAccountSheet();
  var data = sheet.getDataRange().getValues();
  data.shift();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[1]).trim().toUpperCase() === String(account).trim().toUpperCase()) {
      var perm = row.length > 2 ? String(row[2]).trim() : '';
      return {
        name: String(row[0]).trim(),
        account: String(row[1]).trim(),
        role: perm === '大樹' ? '大樹' : '小樹苗'
      };
    }
  }
  return null;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────── doGet ─────────────────────────

function doGet(e) {
  var action = e.parameter.action;

  // 登入
  if (action === 'login') {
    var acc = getAccount(e.parameter.account);
    return jsonOutput({ success: acc !== null, role: acc ? acc.role : '', name: acc ? acc.name : '', account: acc ? acc.account : '' });
  }

  // 小樹苗的日記
  if (action === 'myEntries') {
    var me = getAccount(e.parameter.account);
    if (!me) return jsonOutput({ success: false, entries: [] });
    var data = getSheet().getDataRange().getValues();
    data.shift();
    return jsonOutput({ success: true, entries: data.filter(function(r){ return r[0] && r[2].toString().trim().toUpperCase() === me.account.toUpperCase(); }).map(rowToEntry) });
  }

  // 大樹看全部日記
  if (action === 'allEntries') {
    var boss = getAccount(e.parameter.account);
    if (!boss || boss.role !== '大樹') return jsonOutput({ success: false, entries: [] });
    var data = getSheet().getDataRange().getValues();
    data.shift();
    return jsonOutput({ success: true, entries: data.filter(function(r){ return r[0]; }).map(rowToEntry) });
  }

  // 大樹取得小樹苗名單
  if (action === 'staffList') {
    var req = getAccount(e.parameter.account);
    if (!req || req.role !== '大樹') return jsonOutput({ success: false, staff: [] });
    var data = getAccountSheet().getDataRange().getValues();
    data.shift();
    return jsonOutput({ success: true, staff: data.filter(function(r){ return r[1] && String(r[2]).trim() !== '大樹'; }).map(function(r){ return { name: String(r[0]).trim(), account: String(r[1]).trim() }; }) });
  }

  // 小樹苗的收件匣（大樹傳給他的訊息）
  if (action === 'inbox') {
    var me = getAccount(e.parameter.account);
    if (!me) return jsonOutput({ success: false, messages: [] });
    var msgSheet = getMessageSheet();
    if (!msgSheet) return jsonOutput({ success: true, messages: [] });
    var data = msgSheet.getDataRange().getValues();
    data.shift();
    return jsonOutput({ success: true, messages: data.filter(function(r){ return r[0] && String(r[3]).trim().toUpperCase() === me.account.toUpperCase(); }).map(rowToMessage) });
  }

  // 大樹已發出的訊息（for 大樹查看自己傳的訊息串）
  if (action === 'sentMessages') {
    var me = getAccount(e.parameter.account);
    if (!me || me.role !== '大樹') return jsonOutput({ success: false, messages: [] });
    var msgSheet = getMessageSheet();
    if (!msgSheet) return jsonOutput({ success: true, messages: [] });
    var data = msgSheet.getDataRange().getValues();
    data.shift();
    return jsonOutput({ success: true, messages: data.filter(function(r){ return r[0] && String(r[2]).trim().toUpperCase() === me.account.toUpperCase(); }).map(rowToMessage) });
  }

  // 取得當前使用者可見的所有對話紀錄
  if (action === 'myThreads') {
    var user = getAccount(e.parameter.account);
    if (!user) return jsonOutput({ success: false, messages: [] });
    var tSheet = getThreadSheet();
    if (!tSheet) return jsonOutput({ success: true, messages: [] });
    var tData = tSheet.getDataRange().getValues();
    tData.shift();
    var allMsgs = tData.filter(function(r){ return r[0]; }).map(rowToThreadMsg);

    if (user.role === '大樹') {
      return jsonOutput({ success: true, messages: allMsgs });
    }

    // 小樹苗只能看自己日記 + 自己的收件訊息 的對話
    var allowed = {};
    var dData = getSheet().getDataRange().getValues();
    dData.shift();
    dData.forEach(function(r){ if (r[0] && String(r[2]).trim().toUpperCase() === user.account.toUpperCase()) allowed[String(r[0])] = 1; });
    var mSheet = getMessageSheet();
    if (mSheet) {
      var mData = mSheet.getDataRange().getValues();
      mData.shift();
      mData.forEach(function(r){
        if (r[0] && (String(r[3]).trim().toUpperCase() === user.account.toUpperCase() || String(r[2]).trim().toUpperCase() === user.account.toUpperCase())) allowed[String(r[0])] = 1;
      });
    }
    return jsonOutput({ success: true, messages: allMsgs.filter(function(m){ return allowed[m.threadId]; }) });
  }

  // 公開留言板
  if (action === 'publicBoard') {
    var user = getAccount(e.parameter.account);
    if (!user) return jsonOutput({ success: false, posts: [] });
    var pSheet = getPublicSheet();
    if (!pSheet) return jsonOutput({ success: true, posts: [] });
    var pData = pSheet.getDataRange().getValues();
    pData.shift();
    return jsonOutput({ success: true, posts: pData.filter(function(r){ return r[0]; }).map(rowToPublicPost) });
  }

  // 公開留言板的對話紀錄
  if (action === 'publicThreads') {
    var user = getAccount(e.parameter.account);
    if (!user) return jsonOutput({ success: false, messages: [] });
    var tSheet = getThreadSheet();
    if (!tSheet) return jsonOutput({ success: true, messages: [] });
    var pSheet = getPublicSheet();
    if (!pSheet) return jsonOutput({ success: true, messages: [] });
    var pIds = {};
    var pData = pSheet.getDataRange().getValues();
    pData.shift();
    pData.forEach(function(r){ if (r[0]) pIds[String(r[0])] = 1; });
    var tData = tSheet.getDataRange().getValues();
    tData.shift();
    return jsonOutput({ success: true, messages: tData.filter(function(r){ return r[0] && pIds[String(r[1])]; }).map(rowToThreadMsg) });
  }

  return jsonOutput({ success: false, message: '未知的動作' });
}

// ───────────────────────── doPost ─────────────────────────

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var sheet = getSheet();

  // 小樹苗新增日記
  if (payload.action === 'add') {
    var acc = getAccount(payload.account);
    if (!acc) return jsonOutput({ success: false, message: '帳號不正確' });
    sheet.appendRow([payload.id, acc.name, acc.account, payload.entryDate, payload.content, payload.createdAt, '', '', '']);
    return jsonOutput({ success: true });
  }

  // 大樹首次回覆（舊系統相容，新版用 addReply）
  if (payload.action === 'reply') {
    var boss = getAccount(payload.account);
    if (!boss || boss.role !== '大樹') return jsonOutput({ success: false, message: '沒有回覆權限' });
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.id)) {
        sheet.getRange(i + 1, 7).setValue(payload.reply);
        sheet.getRange(i + 1, 8).setValue(payload.repliedAt);
        sheet.getRange(i + 1, 9).setValue(boss.name);
        break;
      }
    }
    return jsonOutput({ success: true });
  }

  // 大樹主動傳訊息給特定小樹苗
  if (payload.action === 'sendMessage') {
    var sender = getAccount(payload.fromAccount);
    if (!sender || sender.role !== '大樹') return jsonOutput({ success: false, message: '沒有發送權限' });
    var rec = getAccount(payload.toAccount);
    if (!rec) return jsonOutput({ success: false, message: '找不到收件者' });
    var msgSheet = getMessageSheet();
    if (!msgSheet) return jsonOutput({ success: false, message: '請先建立「大樹信件」分頁' });
    msgSheet.appendRow([payload.id, sender.name, sender.account, rec.account, payload.content, payload.createdAt]);
    return jsonOutput({ success: true });
  }

  // 對話回覆（日記、私訊、公開留言板都用這個）
  if (payload.action === 'addReply') {
    var user = getAccount(payload.account);
    if (!user) return jsonOutput({ success: false, message: '帳號不正確' });
    var tSheet = getThreadSheet();
    if (!tSheet) return jsonOutput({ success: false, message: '請先建立「對話紀錄」分頁' });
    tSheet.appendRow([payload.id, payload.threadId, user.name, user.account, payload.content, payload.createdAt]);
    return jsonOutput({ success: true });
  }

  // 新增公開留言
  if (payload.action === 'publicPost') {
    var user = getAccount(payload.account);
    if (!user) return jsonOutput({ success: false, message: '帳號不正確' });
    var pSheet = getPublicSheet();
    if (!pSheet) return jsonOutput({ success: false, message: '請先建立「公開留言板」分頁' });
    pSheet.appendRow([payload.id, user.name, user.account, payload.content, payload.createdAt]);
    return jsonOutput({ success: true });
  }

  return jsonOutput({ success: false, message: '未知的動作' });
}
