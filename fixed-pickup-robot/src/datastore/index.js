// 資料儲存抽象層。
// 依 config.datastore 選擇後端;兩種後端提供相同介面,
// 讓上層(表單伺服器、每日排程)完全不必在意資料存哪。
//
// 介面:
//   listCustomers()            -> Promise<Customer[]>
//   addCustomer(record)        -> Promise<void>
//   updateStatus(id, status)   -> Promise<void>
//   appendLog(logRow)          -> Promise<void>
//   listLogs()                 -> Promise<LogRow[]>
import { config } from '../config.js';
import { LocalJsonStore } from './localJson.js';
import { GoogleSheetsStore } from './googleSheets.js';

let instance = null;

export function getStore() {
  if (instance) return instance;
  if (config.datastore === 'google-sheets') {
    instance = new GoogleSheetsStore();
  } else {
    instance = new LocalJsonStore();
  }
  return instance;
}
