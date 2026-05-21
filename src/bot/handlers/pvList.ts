import { Bot, Context, InlineKeyboard } from 'grammy';
import { Api } from 'telegram';
import { ensureConnected } from '../../telegram/client.js';
import { getState, setState, toggleNotification } from '../../state/index.js';
import { PAGE_SIZE } from '../../utils/pagination.js';
import { showMainMenu } from './menu.js';
import { translateGramJsError, formatMessage, formatChatHeader } from '../../utils/format.js';
import { dialogCache, CACHE_TTL, DialogItem } from './pvListCache.js';

export type { DialogItem };

async function safeAnswer(ctx: Context, text = ''): Promise<void> {
  try { await ctx.answerCallbackQuery(text); } catch { /* expired */ }
}

export async function fetchAllDialogs(userId: number, forceRefresh = false): Promise<void> {
  const cached = dialogCache.get(userId);
  if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL) return;

  const client = await ensureConnected(userId);
  if (!client) return;

  const items: DialogItem[] = [];
  await new Promise(r => setTimeout(r, 300));

  for await (const dialog of client.iterDialogs({ limit: 300 })) {
    const entity = dialog.entity;
    if (!entity) continue;

    if (entity instanceof Api.User && !entity.bot && !entity.deleted) {
      const name = [entity.firstName, entity.lastName].filter(Boolean).join(' ')
        || (entity.username ? `@${entity.username}` : null)
        || 'ناشناس';
      items.push({ peerId: entity.id.toString(), name, unreadCount: dialog.unreadCount ?? 0, type: 'user' });
    } else if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
      items.push({
        peerId: entity.id.toString(),
        name: (entity as any).title ?? 'بی‌نام',
        unreadCount: dialog.unreadCount ?? 0,
        type: 'channel',
      });
    }
  }

  dialogCache.set(userId, { items, ts: Date.now() });
}

export async function fetchPvDialogs(userId: number, forceRefresh = false): Promise<DialogItem[]> {
  await fetchAllDialogs(userId, forceRefresh);
  return dialogCache.get(userId)?.items.filter(d => d.type === 'user') ?? [];
}

export function getCachedDialog(userId: number, peerId: string): DialogItem | undefined {
  return dialogCache.get(userId)?.items.find(d => d.peerId === peerId);
}

export function invalidateDialogCache(userId: number): void {
  dialogCache.delete(userId);
}

export async function showPvList(ctx: Context, userId: number, forceRefresh = false): Promise<void> {
  const state = getState(userId);
  const page = state.pvPage;

  let dialogs: DialogItem[];
  try {
    dialogs = await fetchPvDialogs(userId, forceRefresh);
  } catch (err) {
    await ctx.reply(`❌ خطا در دریافت لیست چت‌ها: ${translateGramJsError(err)}`);
    return;
  }

  if (dialogs.length === 0) {
    const keyboard = new InlineKeyboard()
      .text('🔄 تازه‌سازی', 'pv_refresh').row()
      .text('🔙 برگشت', 'menu_main');
    await ctx.reply('📭 هیچ پیام خصوصی‌ای یافت نشد.', { reply_markup: keyboard });
    return;
  }

  const totalPages = Math.ceil(dialogs.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageItems = dialogs.slice(start, start + PAGE_SIZE);

  const keyboard = new InlineKeyboard();
  for (const item of pageItems) {
    const unread = item.unreadCount > 0 ? ` (${item.unreadCount} 🔴)` : '';
    keyboard.text(`👤 ${item.name}${unread}`, `pv_open:${item.peerId}`).row();
  }

  if (page > 0 || (page + 1) * PAGE_SIZE < dialogs.length) {
    if (page > 0) keyboard.text('◀️ قبلی', 'pv_prev');
    if ((page + 1) * PAGE_SIZE < dialogs.length) keyboard.text('▶️ بعدی', 'pv_next');
    keyboard.row();
  }
  keyboard.text('🔄 تازه‌سازی', 'pv_refresh').text('🔙 برگشت', 'menu_main');

  await ctx.reply(
    `📬 پیام‌های خصوصی — صفحه ${page + 1} از ${totalPages} (${dialogs.length} مخاطب):`,
    { reply_markup: keyboard }
  );
}

export function registerPvHandlers(bot: Bot): void {
  bot.callbackQuery('menu_pv', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    setState(userId, { pvPage: 0 });
    let loadingMsg: { message_id: number } | null = null;
    if (!dialogCache.get(userId)) loadingMsg = await ctx.reply('⏳ در حال دریافت لیست مخاطبان...');
    await showPvList(ctx, userId);
    if (loadingMsg) {
      try { await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id); } catch { /* ignore */ }
    }
  });

  bot.callbackQuery('pv_refresh', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    setState(userId, { pvPage: 0 });
    const loadingMsg = await ctx.reply('⏳ در حال بارگذاری مجدد...');
    await showPvList(ctx, userId, true);
    try { await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id); } catch { /* ignore */ }
  });

  bot.callbackQuery('pv_prev', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    const state = getState(userId);
    if (state.pvPage > 0) setState(userId, { pvPage: state.pvPage - 1 });
    await showPvList(ctx, userId);
  });

  bot.callbackQuery('pv_next', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    const state = getState(userId);
    setState(userId, { pvPage: state.pvPage + 1 });
    await showPvList(ctx, userId);
  });

  bot.callbackQuery(/^pv_open:(-?\d+)$/, async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    const peerId = ctx.match[1];
    const dialog = getCachedDialog(userId, peerId);
    const peerName = dialog?.name ?? 'مخاطب';
    await openPvChat(ctx, userId, peerId, peerName);
  });

  bot.callbackQuery(/^notif_toggle:(-?\d+)$/, async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    const peerId = ctx.match[1];
    const isOn = toggleNotification(userId, peerId);
    await ctx.reply(isOn ? '🔔 اعلان مستقیم برای این چت فعال شد.' : '🔕 اعلان مستقیم برای این چت غیرفعال شد.');
    // Refresh chat view to update button
    const dialog = getCachedDialog(userId, peerId);
    const peerName = dialog?.name ?? 'مخاطب';
    await openPvChat(ctx, userId, peerId, peerName);
  });
}

export async function openPvChat(ctx: Context, userId: number, peerId: string, peerName: string): Promise<void> {
  setState(userId, { activeChat: { peerId, peerName, type: 'user' } });

  const client = await ensureConnected(userId);
  if (!client) {
    await ctx.reply('❌ اتصال به تلگرام برقرار نیست.');
    return;
  }

  try {
    await new Promise(r => setTimeout(r, 500));
    const messages = await client.getMessages(peerId, { limit: 10 });
    const me = await client.getMe();
    const myId = me.id.toString();

    const lines: string[] = [];
    for (const msg of [...messages].reverse()) {
      if (!msg.message) continue;
      const isMe = msg.senderId?.toString() === myId || msg.out === true;
      lines.push(formatMessage(msg.message, peerName, isMe, new Date(msg.date * 1000)));
    }

    const state = getState(userId);
    const hasNotif = (state.notifications ?? []).includes(peerId);
    const notifBtn = hasNotif ? '🔔 اعلان: روشن' : '🔕 اعلان: خاموش';

    const firstMsgId = messages[messages.length - 1]?.id ?? 0;
    const keyboard = new InlineKeyboard()
      .text('📜 ۱۰ پیام قبلی', `pv_history:${peerId}:${firstMsgId}`).row()
      .text(notifBtn, `notif_toggle:${peerId}`).row()
      .text('🔕 خروج از چت', 'chat_exit')
      .text('🔙 لیست', 'menu_pv');

    const body = lines.length > 0
      ? formatChatHeader(peerName, lines)
      : `💬 چت با ${peerName}\n━━━━━━━━━━━━━━━\n(هنوز پیامی نیست)\n━━━━━━━━━━━━━━━\n💡 هر پیامی بفرستی به این چت می‌رود`;

    await ctx.reply(body, { reply_markup: keyboard });
  } catch (err) {
    await ctx.reply(`❌ ${translateGramJsError(err)}`);
  }
}
