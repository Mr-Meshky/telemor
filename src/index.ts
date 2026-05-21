import 'dotenv/config';
import { createBot } from './bot/index.js';
import { loadFromDisk, getLoggedInUserIds } from './state/index.js';
import { ensureConnected } from './telegram/client.js';
import { registerListener } from './telegram/listeners.js';

async function reconnectExistingSessions(bot: ReturnType<typeof createBot>): Promise<void> {
  const userIds = getLoggedInUserIds();
  if (userIds.length === 0) return;

  console.log(`🔄 بازاتصال ${userIds.length} کاربر...`);

  for (const userId of userIds) {
    try {
      const client = await ensureConnected(userId);
      if (client) {
        registerListener(userId, bot);
        console.log(`✅ کاربر ${userId} متصل شد`);
      } else {
        console.log(`⚠️ کاربر ${userId}: session منقضی`);
      }
    } catch (err) {
      console.error(`❌ خطا در بازاتصال کاربر ${userId}:`, err);
    }
    // Rate limit between reconnects
    await new Promise(r => setTimeout(r, 1000));
  }
}

async function main(): Promise<void> {
  const token = process.env.BALE_TOKEN;
  if (!token) {
    console.error('❌ BALE_TOKEN is not set in .env');
    process.exit(1);
  }

  loadFromDisk();
  console.log('✅ State loaded');

  const bot = createBot(token);
  console.log('✅ Bot created');

  // Start bot first so it's ready to receive messages
  bot.start({
    onStart: async (info) => {
      console.log(`🤖 Bot @${info.username} started`);
      // Then reconnect existing sessions in background
      reconnectExistingSessions(bot).catch(console.error);
    },
  }).catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
