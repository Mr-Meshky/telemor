import { Bot, Context, InlineKeyboard } from 'grammy';
import { Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { computeCheck } from 'telegram/Password.js';
import {
  getState,
  setState,
  resetLoginState,
  setLoginTimeout,
  clearLoginTimeout,
} from '../../state/index.js';
import { createClient, saveSession, getClient } from '../../telegram/client.js';
import { registerListener } from '../../telegram/listeners.js';
import { translateGramJsError } from '../../utils/format.js';
import { showMainMenu } from './menu.js';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

// phoneCodeHash per user login session
const phoneCodeHashMap = new Map<number, string>();

export function registerStartHandlers(bot: Bot): void {
  bot.command('start', async (ctx) => {
    const userId = ctx.from!.id;
    const state = getState(userId);

    if (state.loginStep === 'done' && state.telegramSession) {
      await showMainMenu(ctx);
      return;
    }

    const keyboard = new InlineKeyboard().text('🔗 اتصال به تلگرام', 'connect_telegram');
    await ctx.reply(
      'سلام! 👋\nبه ربات تله‌مور خوش آمدید.\nاین ربات به شما امکان می‌دهد اکانت تلگرامتان را از طریق بله مدیریت کنید.',
      { reply_markup: keyboard }
    );
  });

  bot.callbackQuery('connect_telegram', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    resetLoginState(userId);
    setState(userId, { loginStep: 'waiting_api_id' });
    setLoginTimeout(userId, LOGIN_TIMEOUT_MS, async () => {
      try {
        await bot.api.sendMessage(userId, '⏰ زمان ورود به پایان رسید. لطفاً مجدداً /start را بزنید.');
      } catch { /* ignore */ }
    });
    await ctx.reply('📋 مرحله ۱/۵: لطفاً API ID خود را وارد کنید.\n\nبرای دریافت آن به my.telegram.org مراجعه کنید.');
  });
}

export async function handleLoginFlow(ctx: Context, bot: Bot): Promise<boolean> {
  const userId = ctx.from!.id;
  const state = getState(userId);
  const text = (ctx.message?.text ?? '').trim();

  if (state.loginStep === 'idle' || state.loginStep === 'done') return false;

  switch (state.loginStep) {
    case 'waiting_api_id': {
      const apiId = parseInt(text, 10);
      if (isNaN(apiId) || apiId <= 0) {
        await ctx.reply('❌ API ID باید یک عدد صحیح مثبت باشد. دوباره وارد کنید:');
        return true;
      }
      setState(userId, { loginData: { ...state.loginData, apiId }, loginStep: 'waiting_api_hash' });
      await ctx.reply('📋 مرحله ۲/۵: API Hash خود را وارد کنید:');
      return true;
    }

    case 'waiting_api_hash': {
      if (!/^[a-f0-9]{32}$/i.test(text)) {
        await ctx.reply('❌ API Hash نامعتبر است (باید ۳۲ کاراکتر hex باشد). دوباره وارد کنید:');
        return true;
      }
      setState(userId, { loginData: { ...state.loginData, apiHash: text }, loginStep: 'waiting_phone' });
      await ctx.reply('📋 مرحله ۳/۵: شماره تلفن خود را با فرمت بین‌المللی وارد کنید:\nمثال: +989123456789');
      return true;
    }

    case 'waiting_phone': {
      if (!/^\+\d{7,15}$/.test(text)) {
        await ctx.reply('❌ شماره تلفن نامعتبر است. باید با + شروع شود. مثال: +989123456789');
        return true;
      }
      const { apiId, apiHash } = state.loginData;
      if (!apiId || !apiHash) {
        await ctx.reply('❌ خطای داخلی. لطفاً /start را مجدداً بزنید.');
        resetLoginState(userId);
        return true;
      }

      setState(userId, { loginData: { ...state.loginData, phone: text }, loginStep: 'waiting_code' });

      try {
        const client = await createClient(userId, apiId, apiHash);
        await client.connect();
        await new Promise(r => setTimeout(r, 800));
        const result = await client.sendCode({ apiId, apiHash }, text);
        phoneCodeHashMap.set(userId, result.phoneCodeHash);
        await ctx.reply('📋 مرحله ۴/۵: کد تأیید که تلگرام برایتان فرستاده را وارد کنید:');
      } catch (err) {
        await ctx.reply(`❌ ${translateGramJsError(err)}`);
        resetLoginState(userId);
      }
      return true;
    }

    case 'waiting_code': {
      const { apiId, apiHash, phone } = state.loginData;
      const phoneCodeHash = phoneCodeHashMap.get(userId);
      if (!apiId || !apiHash || !phone || !phoneCodeHash) {
        await ctx.reply('❌ خطای داخلی. لطفاً /start را مجدداً بزنید.');
        resetLoginState(userId);
        return true;
      }

      const client = getClient(userId);
      if (!client) {
        await ctx.reply('❌ کلاینت یافت نشد. لطفاً /start را مجدداً بزنید.');
        resetLoginState(userId);
        return true;
      }

      try {
        // Strip spaces in case user types code like "12 345"
        const phoneCode = text.replace(/\s/g, '');
        await client.invoke(
          new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode })
        );
        await onLoginSuccess(userId, ctx, bot);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('SESSION_PASSWORD_NEEDED')) {
          setState(userId, { loginStep: 'waiting_2fa' });
          await ctx.reply('📋 مرحله ۵/۵: رمز دو مرحله‌ای (2FA) خود را وارد کنید:');
        } else if (msg.includes('PHONE_CODE_INVALID')) {
          await ctx.reply('❌ کد وارد شده اشتباه است. دوباره وارد کنید:');
        } else {
          await ctx.reply(`❌ ${translateGramJsError(err)}`);
          resetLoginState(userId);
        }
      }
      return true;
    }

    case 'waiting_2fa': {
      const client = getClient(userId);
      if (!client) {
        await ctx.reply('❌ کلاینت یافت نشد. لطفاً /start را مجدداً بزنید.');
        resetLoginState(userId);
        return true;
      }

      try {
        const passwordInfo = await client.invoke(new Api.account.GetPassword());
        const inputCheck = await computeCheck(passwordInfo, text);
        await client.invoke(new Api.auth.CheckPassword({ password: inputCheck }));
        await onLoginSuccess(userId, ctx, bot);
      } catch (err) {
        await ctx.reply(`❌ ${translateGramJsError(err)}`);
      }
      return true;
    }
  }

  return false;
}

async function onLoginSuccess(userId: number, ctx: Context, bot: Bot): Promise<void> {
  saveSession(userId);
  clearLoginTimeout(userId);
  const client = getClient(userId)!;
  const session = (client.session as StringSession).save();
  const state = getState(userId);
  setState(userId, {
    loginStep: 'done',
    telegramSession: session,
    apiId: state.loginData.apiId ?? null,
    apiHash: state.loginData.apiHash ?? null,
    phone: state.loginData.phone ?? null,
    loginData: {},
  });
  phoneCodeHashMap.delete(userId);
  registerListener(userId, bot);
  await ctx.reply('✅ ورود به تلگرام موفقیت‌آمیز بود!');
  await showMainMenu(ctx);
}
