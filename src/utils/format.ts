export function formatTimestamp(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  if (msgDate.getTime() === today.getTime()) return `امروز ${timeStr}`;
  if (msgDate.getTime() === yesterday.getTime()) return `دیروز ${timeStr}`;
  return date.toLocaleDateString('fa-IR') + ' ' + timeStr;
}

export function formatMessage(
  text: string,
  senderName: string,
  isMe: boolean,
  date: Date
): string {
  const prefix = isMe ? '📤 من' : `👤 ${senderName}`;
  return `[${formatTimestamp(date)}] ${prefix}: ${text}`;
}

export function formatNewMessageNotification(
  senderName: string,
  text: string,
  date: Date
): string {
  const timeStr = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return `📩 پیام جدید از ${senderName}\n━━━━━━━━━━━━━━━\n${text}\n━━━━━━━━━━━━━━━\n[${timeStr}]`;
}

export function formatChatHeader(name: string, messages: string[]): string {
  return `💬 چت با ${name}\n━━━━━━━━━━━━━━━\n${messages.join('\n')}\n━━━━━━━━━━━━━━━\n💡 هر پیامی بفرستی به این چت می‌رود`;
}

export function translateGramJsError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('PHONE_CODE_INVALID')) return 'کد وارد شده اشتباه است.';
  if (msg.includes('SESSION_PASSWORD_NEEDED')) return 'رمز دو مرحله‌ای لازم است.';
  if (msg.includes('FLOOD_WAIT')) {
    const match = msg.match(/FLOOD_WAIT_(\d+)/);
    const secs = match ? match[1] : '?';
    return `تلگرام موقتاً درخواست را محدود کرده. ${secs} ثانیه صبر کنید.`;
  }
  if (msg.includes('PHONE_NUMBER_INVALID')) return 'شماره تلفن نامعتبر است.';
  if (msg.includes('AUTH_KEY_UNREGISTERED') || msg.includes('AUTH_KEY_INVALID')) return 'نشست منقضی شده. لطفاً از طریق /start مجدداً وارد شوید.';
  if (msg.includes('PASSWORD_HASH_INVALID')) return 'رمز دو مرحله‌ای اشتباه است.';

  return `خطا: ${msg}`;
}
