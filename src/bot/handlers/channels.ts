import { Bot, Context, InlineKeyboard } from 'grammy';
import { getState, setState, toggleNotification } from '../../state/index.js';
import { PAGE_SIZE } from '../../utils/pagination.js';
import { translateGramJsError, formatMessage, formatChatHeader } from '../../utils/format.js';
import { fetchAllDialogs, getCachedDialog } from './pvList.js';
import { dialogCache } from './pvListCache.js';
import { ensureConnected } from '../../telegram/client.js';

async function safeAnswer(ctx: Context, text = ''): Promise<void> {
  try { await ctx.answerCallbackQuery(text); } catch { /* expired */ }
}

export async function showChannelList(ctx: Context, userId: number, forceRefresh = false): Promise<void> {
  const state = getState(userId);
  const page = state.channelPage;

  try {
    await fetchAllDialogs(userId, forceRefresh);
  } catch (err) {
    await ctx.reply(`❌ خطا: ${translateGramJsError(err)}`);
    return;
  }

  const all = dialogCache.get(userId)?.items.filter(d => d.type === 'channel') ?? [];

  if (all.length === 0) {
    const keyboard = new InlineKeyboard()
      .text('🔄 تازه‌سازی', 'ch_refresh').row()
      .text('🔙 برگشت', 'menu_main');
    await ctx.reply('📭 هیچ کانال یا گروهی یافت نشد.', { reply_markup: keyboard });
    return;
  }

  const totalPages = Math.ceil(all.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageItems = all.slice(start, start + PAGE_SIZE);

  const keyboard = new InlineKeyboard();
  for (const item of pageItems) {
    const unread = item.unreadCount > 0 ? ` (${item.unreadCount} 🔴)` : '';
    keyboard.text(`📢 ${item.name}${unread}`, `ch_open:${item.peerId}`).row();
  }

  if (page > 0 || (page + 1) * PAGE_SIZE < all.length) {
    if (page > 0) keyboard.text('◀️ قبلی', 'ch_prev');
    if ((page + 1) * PAGE_SIZE < all.length) keyboard.text('▶️ بعدی', 'ch_next');
    keyboard.row();
  }
  keyboard.text('🔄 تازه‌سازی', 'ch_refresh').text('🔙 برگشت', 'menu_main');

  await ctx.reply(
    `📢 کانال‌ها و گروه‌ها — صفحه ${page + 1} از ${totalPages} (${all.length} مورد):`,
    { reply_markup: keyboard }
  );
}

export function registerChannelHandlers(bot: Bot): void {
  bot.callbackQuery('menu_channels', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    setState(userId, { channelPage: 0 });
    let loadingMsg: { message_id: number } | null = null;
    if (!dialogCache.get(userId)) loadingMsg = await ctx.reply('⏳ در حال دریافت لیست...');
    await showChannelList(ctx, userId);
    if (loadingMsg) {
      try { await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id); } catch { /* ignore */ }
    }
  });

  bot.callbackQuery('ch_refresh', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    setState(userId, { channelPage: 0 });
    const loadingMsg = await ctx.reply('⏳ در حال بارگذاری مجدد...');
    await showChannelList(ctx, userId, true);
    try { await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id); } catch { /* ignore */ }
  });

  bot.callbackQuery('ch_prev', async (ctx) => {
    await safeAnswer(ctx);
    const state = getState(ctx.from.id);
    if (state.channelPage > 0) setState(ctx.from.id, { channelPage: state.channelPage - 1 });
    await showChannelList(ctx, ctx.from.id);
  });

  bot.callbackQuery('ch_next', async (ctx) => {
    await safeAnswer(ctx);
    const state = getState(ctx.from.id);
    setState(ctx.from.id, { channelPage: state.channelPage + 1 });
    await showChannelList(ctx, ctx.from.id);
  });

  bot.callbackQuery(/^ch_open:(-?\d+)$/, async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    const peerId = ctx.match[1];
    const dialog = getCachedDialog(userId, peerId);
    await openChannel(ctx, userId, peerId, dialog?.name ?? 'کانال');
  });

  bot.callbackQuery('ch_exit', async (ctx) => {
    await safeAnswer(ctx);
    setState(ctx.from.id, { activeChat: null });
    await ctx.reply('✅ از کانال خارج شدید.');
    const { showMainMenu } = await import('./menu.js');
    await showMainMenu(ctx);
  });

  bot.callbackQuery(/^ch_notif_toggle:(-?\d+)$/, async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    const peerId = ctx.match[1];
    const isOn = toggleNotification(userId, peerId);
    await ctx.reply(isOn ? '🔔 اعلان مستقیم فعال شد.' : '🔕 اعلان مستقیم غیرفعال شد.');
    const dialog = getCachedDialog(userId, peerId);
    await openChannel(ctx, userId, peerId, dialog?.name ?? 'کانال');
  });
}

async function openChannel(ctx: Context, userId: number, peerId: string, peerName: string): Promise<void> {
  setState(userId, { activeChat: { peerId, peerName, type: 'channel' } });

  const client = await ensureConnected(userId);
  if (!client) { await ctx.reply('❌ اتصال به تلگرام برقرار نیست.'); return; }

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
      .text('📜 ۱۰ پست قبلی', `ch_history:${peerId}:${firstMsgId}`).row()
      .text(notifBtn, `ch_notif_toggle:${peerId}`).row()
      .text('🔕 خروج از کانال', 'ch_exit')
      .text('🔙 لیست', 'menu_channels');

    const body = lines.length > 0
      ? formatChatHeader(peerName, lines)
      : `📢 کانال ${peerName}\n━━━━━━━━━━━━━━━\n(هنوز پستی نیست)\n━━━━━━━━━━━━━━━`;

    await ctx.reply(body, { reply_markup: keyboard });
  } catch (err) {
    await ctx.reply(`❌ ${translateGramJsError(err)}`);
  }
}
