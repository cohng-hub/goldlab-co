// server/notify.js - Non-blocking Admin Notification Dispatcher (Push & SMS)

const DEFAULT_ADMIN_PHONE = '01040174988';

/**
 * Send admin notification via configured channels (ntfy push, Telegram, Aligo SMS).
 * Non-blocking and safe: never throws or delays customer API responses.
 */
async function sendAdminNotification(title, message) {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const tasks = [];

  // 1. ntfy.sh Mobile Push Notification (Free, Instant iOS/Android Push)
  const ntfyTopic = (process.env.NTFY_TOPIC || '').trim();
  if (ntfyTopic) {
    const ntfyServer = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
    tasks.push(
      fetch(`${ntfyServer}/${encodeURIComponent(ntfyTopic)}`, {
        method: 'POST',
        headers: {
          'Title': title,
          'Priority': 'high',
          'Tags': 'bell,gold'
        },
        body: message
      }).catch(err => console.error('[Notify:ntfy]', err.message))
    );
  }

  // 2. Telegram Bot Push Notification (Free)
  const tgToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const tgChatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (tgToken && tgChatId) {
    tasks.push(
      fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: `[${title}]\n${message}`
        })
      }).catch(err => console.error('[Notify:Telegram]', err.message))
    );
  }

  // 3. Aligo SMS Notification to Admin Phone (010-4017-4988)
  const aligoKey = (process.env.ALIGO_API_KEY || process.env.NOTIFY_API_KEY || '').trim();
  const aligoUser = (process.env.ALIGO_USER_ID || '').trim();
  const aligoSender = (process.env.ALIGO_SENDER || process.env.NOTIFY_SENDER_PHONE || DEFAULT_ADMIN_PHONE).replace(/[^0-9]/g, '');
  const adminPhone = (process.env.ADMIN_PHONE || DEFAULT_ADMIN_PHONE).replace(/[^0-9]/g, '');

  if (aligoKey && aligoUser && aligoSender && adminPhone) {
    const params = new URLSearchParams({
      key: aligoKey,
      user_id: aligoUser,
      sender: aligoSender,
      receiver: adminPhone,
      msg: `[골드랩앤코 ${title}]\n${message}`.substring(0, 1900),
      title: title
    });
    tasks.push(
      fetch('https://apis.aligo.in/send/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: params.toString()
      }).catch(err => console.error('[Notify:Aligo]', err.message))
    );
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

module.exports = {
  sendAdminNotification
};
