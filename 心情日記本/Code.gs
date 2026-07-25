/**
 * 心情日記本 - Google Apps Script 後端
 *
 * 使用方式：
 * 1. 開一份新的 Google 試算表
 * 2. 建立兩個工作表(分頁)：
 *    a. 「留言板」，第一列標題依序填：
 *       id / 姓名 / 日期 / 內容 / 建立時間 / 回覆 / 回覆時間
 *    b. 「帳號」，第一列標題填：姓名 / 密碼，下面每一列填一位小樹苗的姓名和密碼
 * 3. 上方選單「擴充功能」→「Apps Script」，把這個檔案整個貼進去（覆蓋原本的 Code.gs）
 * 4. 「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *    - 執行身分：我
 *    - 具有存取權的使用者：所有人
 * 5. 部署後拿到的網址（結尾是 /exec），貼到 team-board-mobile.html 和
 *    team-board-desktop.html 裡的 API_URL
 *
 * 說明：
 * - 這個版本是「小樹苗」專用（同仁登入後只能看到自己的留言 + 大樹的叮嚀）
 * - 「大樹」（主管）要回覆留言，目前用 reply 這個 action 寫入，
 *   之後如果要做主管專用介面，可以另外做一個頁面呼叫這個 action，
 *   不需要改這支程式碼
 */

var SHEET_NAME = '留言板';
var ACCOUNT_SHEET_NAME = '帳號';

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function getAccountSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCOUNT_SHEET_NAME);
}

// 欄位順序：id / 姓名 / 日期 / 內容 / 建立時間 / 回覆 / 回覆時間
function rowToEntry(row) {
  return {
    id: String(row[0]),
    author: String(row[1]),
    entryDate: row[2] instanceof Date
      ? Utilities.formatDate(row[2], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(row[2]),
    content: String(row[3]),
    createdAt: row[4] instanceof Date ? row[4].toISOString() : String(row[4]),
    reply: row[5] ? String(row[5]) : '',
    repliedAt: row[6]
      ? (row[6] instanceof Date ? row[6].toISOString() : String(row[6]))
      : ''
  };
}

function checkCredentials(author, password) {
  var sheet = getAccountSheet();
  var data = sheet.getDataRange().getValues();
  data.shift(); // 移除標題列
  return data.some(function (row) {
    return String(row[0]).trim() === String(author).trim() &&
           String(row[1]) === String(password);
  });
}

function doGet(e) {
  var action = e.parameter.action;

  if (action === 'login') {
    var valid = checkCredentials(e.parameter.author, e.parameter.password);
    return ContentService
      .createTextOutput(JSON.stringify({ success: valid }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'myEntries') {
    var author = e.parameter.author;
    var password = e.parameter.password;
    if (!checkCredentials(author, password)) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, entries: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var sheet = getSheet();
    var data = sheet.getDataRange().getValues();
    data.shift();
    var entries = data
      .filter(function (row) {
        return row[0] && String(row[1]).trim() === String(author).trim();
      })
      .map(rowToEntry);
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, entries: entries }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 預設：回傳全部留言（保留給之後的「大樹」介面使用）
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  data.shift();
  var entries = data
    .filter(function (row) { return row[0]; })
    .map(rowToEntry);
  return ContentService
    .createTextOutput(JSON.stringify({ entries: entries }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var sheet = getSheet();

  if (payload.action === 'add') {
    // 送出新留言前先驗證帳密，避免有人冒用別人的名字
    if (!checkCredentials(payload.author, payload.password)) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, message: '帳號或密碼不正確' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    sheet.appendRow([
      payload.id,
      payload.author,
      payload.entryDate,
      payload.content,
      payload.createdAt,
      '',
      ''
    ]);
  } else if (payload.action === 'reply') {
    // 大樹回覆，保留給之後的主管介面使用，暫時不需要密碼
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.id)) {
        sheet.getRange(i + 1, 6).setValue(payload.reply);
        sheet.getRange(i + 1, 7).setValue(payload.repliedAt);
        break;
      }
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
