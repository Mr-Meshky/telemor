import { Bot } from 'grammy';
import { registerStartHandlers, handleLoginFlow } from './handlers/start.js';
import { registerPvHandlers } from './handlers/pvList.js';
import { registerChatHandlers, handleActiveChat } from './handlers/chat.js';
import { registerChannelHandlers } from './handlers/channels.js';
import { registerSettingsHandlers } from './handlers/settings.js';

export function createBot(token: string): Bot {
  const bot = new Bot(token, {
    client: {
      apiRoot: 'https://tapi.bale.ai',
    },
  });

  // Register all handlers
  registerStartHandlers(bot);
  registerPvHandlers(bot);
  registerChatHandlers(bot);
  registerChannelHandlers(bot);
  registerSettingsHandlers(bot);

  // Message middleware — login flow takes priority, then active chat
  bot.on('message', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const handledByLogin = await handleLoginFlow(ctx, bot);
    if (handledByLogin) return;

    const handledByChat = await handleActiveChat(ctx);
    if (handledByChat) return;

    return next();
  });

  // Error handler
  bot.catch((err) => {
    console.error('Bot error:', err);
  });

  return bot;
}
