import { Bot, Context, InlineKeyboard } from 'grammy';
import { getState, setState } from '../../state/index.js';
import { ensureConnected } from '../../telegram/client.js';
import { translateGramJsError, formatMessage, formatChatHeader } from '../../utils/format.js';
import { showMainMenu } from './menu.js';
import { getTgMsgId } from '../../telegram/replyMap.js';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

export function registerChatHandlers(bot: Bot): void {
  bot.callbackQuery('chat_exit', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch { /* expired */ }
    setState(ctx.from.id, { activeChat: null });
    await ctx.reply('✅ از چت خارج شدید.');
    await showMainMenu(ctx);
  });

  bot.callbackQuery('menu_main', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch { /* expired */ }
    setState(ctx.from.id, { activeChat: null });
    await showMainMenu(ctx);
  });

  // pv_history:<peerId>:<offsetMsgId>
  bot.callbackQuery(/^pv_history:(-?\d+):(\d+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch { /* expired */ }
    const userId = ctx.from.id;
    const [, peerId, offsetStr] = ctx.match;
    const peerName = getState(userId).activeChat?.peerName ?? 'مخاطب';
    await loadHistory(ctx, userId, peerId, peerName, parseInt(offsetStr, 10), false);
  });

  // ch_history:<peerId>:<offsetMsgId>
  bot.callbackQuery(/^ch_history:(-?\d+):(\d+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch { /* expired */ }
    const userId = ctx.from.id;
    const [, peerId, offsetStr] = ctx.match;
    const peerName = getState(userId).activeChat?.peerName ?? 'کانال';
    await loadHistory(ctx, userId, peerId, peerName, parseInt(offsetStr, 10), true);
  });

  // Open chat from notification button
  bot.callbackQuery(/^open_chat:(-?\d+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch { /* expired */ }
    const userId = ctx.from.id;
    const peerId = ctx.match[1];
    const { getCachedDialog, openPvChat } = await import('./pvList.js');
    const dialog = getCachedDialog(userId, peerId);
    await openPvChat(ctx, userId, peerId, dialog?.name ?? 'مخاطب');
  });
}

async function loadHistory(
  ctx: Context,
  userId: number,
  peerId: string,
  peerName: string,
  offsetId: number,
  isChannel: boolean
): Promise<void> {
  const client = await ensureConnected(userId);
  if (!client) { await ctx.reply('❌ اتصال به تلگرام برقرار نیست.'); return; }

  try {
    await new Promise(r => setTimeout(r, 500));
    const messages = await client.getMessages(peerId, { limit: 10, offsetId });
    if (messages.length === 0) { await ctx.reply('📭 پیام بیشتری وجود ندارد.'); return; }

    const me = await client.getMe();
    const myId = me.id.toString();
    const lines: string[] = [];

    for (const msg of [...messages].reverse()) {
      if (!msg.message) continue;
      const isMe = msg.senderId?.toString() === myId || msg.out === true;
      lines.push(formatMessage(msg.message, peerName, isMe, new Date(msg.date * 1000)));
    }

    const oldestId = messages[messages.length - 1]?.id ?? 0;
    const histCb = isChannel ? `ch_history:${peerId}:${oldestId}` : `pv_history:${peerId}:${oldestId}`;
    const backCb = isChannel ? 'menu_channels' : 'menu_pv';

    const keyboard = new InlineKeyboard()
      .text('📜 ۱۰ پیام قبلی‌تر', histCb).row()
      .text('🔕 خروج از چت', 'chat_exit')
      .text('🔙 لیست', backCb);

    await ctx.reply(
      lines.length > 0 ? formatChatHeader(peerName, lines) : '(فقط رسانه در این بازه)',
      { reply_markup: keyboard }
    );
  } catch (err) {
    await ctx.reply(`❌ ${translateGramJsError(err)}`);
  }
}

export async function handleActiveChat(ctx: Context): Promise<boolean> {
  const userId = ctx.from!.id;
  const state = getState(userId);
  if (!state.activeChat || state.activeChat.type === 'channel') return false;

  const { peerId } = state.activeChat;
  const client = await ensureConnected(userId);
  if (!client) {
    await ctx.reply('❌ اتصال به تلگرام برقرار نیست.');
    return true;
  }

  const msg = ctx.message!;

  // Media: Bale → Telegram
  if (msg.photo || msg.document || msg.video || msg.audio) {
    await forwardFileTg(ctx, client, peerId);
    return true;
  }

  const text = msg.text;
  if (!text) return false;

  // Resolve reply: Bale message ID → Telegram message ID
  const replyToBaleId = msg.reply_to_message?.message_id;
  const replyToTgId = replyToBaleId ? getTgMsgId(userId, replyToBaleId) : undefined;

  try {
    await new Promise(r => setTimeout(r, 500));
    await client.sendMessage(peerId, { message: text, replyTo: replyToTgId });
    // No confirmation message — keeps the chat clean
  } catch (err) {
    await ctx.reply(`❌ ${translateGramJsError(err)}`);
  }

  return true;
}

async function forwardFileTg(ctx: Context, client: any, peerId: string): Promise<void> {
  const msg = ctx.message!;
  let fileId = '';
  let fileName = 'file';
  let fileSize = 0;
  let mimeType = 'application/octet-stream';

  if (msg.photo) {
    const p = msg.photo[msg.photo.length - 1];
    fileId = p.file_id; fileSize = p.file_size ?? 0; mimeType = 'image/jpeg'; fileName = 'photo.jpg';
  } else if (msg.document) {
    fileId = msg.document.file_id; fileSize = msg.document.file_size ?? 0;
    mimeType = msg.document.mime_type ?? 'application/octet-stream';
    fileName = msg.document.file_name ?? 'file';
  } else if (msg.video) {
    fileId = msg.video.file_id; fileSize = msg.video.file_size ?? 0;
    mimeType = msg.video.mime_type ?? 'video/mp4'; fileName = 'video.mp4';
  } else if (msg.audio) {
    fileId = msg.audio.file_id; fileSize = msg.audio.file_size ?? 0;
    mimeType = msg.audio.mime_type ?? 'audio/mpeg'; fileName = msg.audio.file_name ?? 'audio.mp3';
  }

  if (!fileId) { await ctx.reply('❌ نوع فایل پشتیبانی نمی‌شود.'); return; }

  if (fileSize > MAX_FILE_BYTES) {
    await ctx.reply(`⚠️ این فایل ${(fileSize / 1024 / 1024).toFixed(1)} مگابایت است و از حد مجاز بله (۱۵ مگابایت) بیشتر است.`);
    return;
  }

  try {
    const fileInfo = await ctx.api.getFile(fileId);
    const url = `https://tapi.bale.ai/file/bot${process.env.BALE_TOKEN}/${fileInfo.file_path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    await new Promise(r => setTimeout(r, 500));
    await client.sendFile(peerId, { file: buf, fileName, mimeType, caption: msg.caption ?? '' });
    await ctx.reply('✅ فایل ارسال شد');
  } catch (err) {
    await ctx.reply(`❌ ${translateGramJsError(err)}`);
  }
}
