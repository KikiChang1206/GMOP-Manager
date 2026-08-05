// 彙總通知:LINE(Messaging API push)+ Email(選填)。
// 無論成功或有缺漏,每天都會發送(設計文件第6、10點),讓使用者每天都能確認。
// 任何管道未設定就自動略過;至少一定會印在 console / 寫進日誌。
import nodemailer from 'nodemailer';
import { config } from './config.js';
import { log } from './logger.js';

// 依驗證結果組出通知文字(格式參考設計文件第7節範例)
export function buildMessage(summary) {
  const { dateStr, planned, confirmed, missing, consecutiveMisses = [] } = summary;
  const lines = [];
  lines.push(`【今日固定取件自動新增結果】${dateStr}`);
  lines.push(`預計新增:${planned.length}筆`);
  lines.push(`確認成功:${confirmed.length}筆`);
  if (missing.length === 0) {
    lines.push('✅ 全數確認成功,無缺漏');
  } else {
    lines.push(`❌ 缺漏:${missing.length}筆 — 請人工確認並手動補單`);
    for (const m of missing) {
      lines.push(`   • ${m.name}(${m.address})${m.reason ? ` — ${m.reason}` : ''}`);
    }
  }
  // 連續缺漏加註警示,避免變成長期遺漏(設計文件第7節補充機制)
  if (consecutiveMisses.length > 0) {
    lines.push('');
    lines.push('⚠️ 連續缺漏提醒(已 2 天以上未成功):');
    for (const m of consecutiveMisses) lines.push(`   • ${m.name}(連續 ${m.days} 天)`);
  }
  return lines.join('\n');
}

async function sendLine(text) {
  if (!config.line.token || config.line.targets.length === 0) return;
  for (const to of config.line.targets) {
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.line.token}`,
        },
        body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
      });
      if (!res.ok) {
        log.error('LINE 推播失敗', to, res.status, await res.text());
      }
    } catch (e) {
      log.error('LINE 推播例外', to, e.message);
    }
  }
}

async function sendEmail(text) {
  const m = config.mail;
  if (!m.host || m.to.length === 0) return;
  try {
    const transporter = nodemailer.createTransport({
      host: m.host,
      port: m.port,
      secure: m.port === 465,
      auth: m.user ? { user: m.user, pass: m.pass } : undefined,
    });
    await transporter.sendMail({
      from: m.from || m.user,
      to: m.to.join(','),
      subject: '固定取件自動新增結果',
      text,
    });
  } catch (e) {
    log.error('Email 發送失敗', e.message);
  }
}

export async function notify(summary) {
  const text = buildMessage(summary);
  log.info('通知內容:\n' + text);
  await Promise.all([sendLine(text), sendEmail(text)]);
  return text;
}
