// 極簡日誌:同時輸出到 console 與 logs/daily.log,方便日後排查。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

const LOG_DIR = path.join(ROOT, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, 'daily.log');

function write(level, args) {
  const line = `[${new Date().toISOString()}] [${level}] ${args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}`;
  // console 供即時觀察;檔案供事後追查
  (level === 'ERROR' ? console.error : console.log)(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    /* 日誌寫檔失敗不應中斷主流程 */
  }
}

export const log = {
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a),
};
