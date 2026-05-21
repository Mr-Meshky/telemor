import { Context, InlineKeyboard } from 'grammy';

export async function showMainMenu(ctx: Context): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('📬 پیام‌های خصوصی (PV)', 'menu_pv').row()
    .text('📢 کانال‌ها', 'menu_channels').row()
    .text('⚙️ تنظیمات', 'menu_settings');

  await ctx.reply('🏠 منوی اصلی را انتخاب کنید:', { reply_markup: keyboard });
}
