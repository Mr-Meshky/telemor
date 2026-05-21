import { Bot, Context, InlineKeyboard } from 'grammy';
import { Api } from 'telegram';
import { getState, setState, resetLoginState } from '../../state/index.js';
import { ensureConnected, disconnectClient } from '../../telegram/client.js';
import { translateGramJsError } from '../../utils/format.js';
import { showMainMenu } from './menu.js';
import { invalidateDialogCache } from './pvList.js';
import { unregisterListener } from '../../telegram/listeners.js';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

async function safeAnswer(ctx: Context, text = ''): Promise<void> {
  try { await ctx.answerCallbackQuery(text); } catch { /* expired */ }
}

export function registerSettingsHandlers(bot: Bot): void {
  bot.callbackQuery('menu_settings', async (ctx) => {
    await safeAnswer(ctx);
    await showSettingsMenu(ctx);
  });

  bot.callbackQuery('settings_info', async (ctx) => {
    await safeAnswer(ctx);
    await showAccountInfo(ctx);
  });

  bot.callbackQuery('settings_relogin', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    await disconnectClient(userId);
    unregisterListener(userId);
    invalidateDialogCache(userId);
    setState(userId, {
      telegramSession: null,
      activeChat: null,
      loginStep: 'waiting_api_id',
    });
    const { setLoginTimeout } = await import('../../state/index.js');
    setLoginTimeout(userId, LOGIN_TIMEOUT_MS, async () => {
      try { await bot.api.sendMessage(userId, '⏰ زمان ورود به پایان رسید. لطفاً /start را بزنید.'); } catch { /* ignore */ }
    });
    await ctx.reply('📋 مرحله ۱/۵: لطفاً API ID جدید خود را وارد کنید:');
  });

  bot.callbackQuery('settings_logout', async (ctx) => {
    await safeAnswer(ctx);
    const keyboard = new InlineKeyboard()
      .text('✅ بله، خروج', 'settings_logout_confirm')
      .text('❌ خیر', 'menu_settings');
    await ctx.reply('آیا مطمئن هستید که می‌خواهید از تلگرام خارج شوید؟', { reply_markup: keyboard });
  });

  bot.callbackQuery('settings_logout_confirm', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;

    try {
      const client = await ensureConnected(userId);
      if (client) await client.invoke(new Api.auth.LogOut());
    } catch { /* ignore */ }

    await disconnectClient(userId);
    unregisterListener(userId);
    invalidateDialogCache(userId);
    resetLoginState(userId);
    setState(userId, {
      telegramSession: null,
      apiId: null,
      apiHash: null,
      phone: null,
      activeChat: null,
      loginStep: 'idle',
      notifications: [],
    });

    const keyboard = new InlineKeyboard().text('🔗 اتصال مجدد', 'connect_telegram');
    await ctx.reply('✅ از تلگرام خارج شدید.', { reply_markup: keyboard });
  });

  bot.callbackQuery('settings_back', async (ctx) => {
    await safeAnswer(ctx);
    await showMainMenu(ctx);
  });
}

async function showSettingsMenu(ctx: Context): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('👤 اطلاعات حساب تلگرام', 'settings_info').row()
    .text('🔄 ورود مجدد', 'settings_relogin').row()
    .text('❌ خروج از تلگرام', 'settings_logout').row()
    .text('🔙 برگشت', 'settings_back');
  await ctx.reply('⚙️ تنظیمات:', { reply_markup: keyboard });
}

async function showAccountInfo(ctx: Context): Promise<void> {
  const userId = ctx.from!.id;
  const client = await ensureConnected(userId);
  if (!client) {
    await ctx.reply('❌ اتصال به تلگرام برقرار نیست.');
    return;
  }
  try {
    const me = await client.getMe();
    const name = [(me as any).firstName, (me as any).lastName].filter(Boolean).join(' ');
    const username = (me as any).username ? `@${(me as any).username}` : 'ندارد';
    const phone = (me as any).phone ?? 'نامشخص';
    const keyboard = new InlineKeyboard().text('🔙 برگشت', 'menu_settings');
    await ctx.reply(
      `👤 اطلاعات حساب تلگرام:\n\n📛 نام: ${name}\n🔖 یوزرنیم: ${username}\n📱 شماره: +${phone}`,
      { reply_markup: keyboard }
    );
  } catch (err) {
    await ctx.reply(`❌ ${translateGramJsError(err)}`);
  }
}
