import { NewMessage, NewMessageEvent } from 'telegram/events/index.js';
import { Api } from 'telegram';
import { Bot, InputFile, InlineKeyboard } from 'grammy';
import { getClient } from './client.js';
import { getState } from '../state/index.js';
import { storeReply } from './replyMap.js';

const listenersRegistered = new Set<number>();

export function registerListener(userId: number, bot: Bot): void {
  const client = getClient(userId);
  if (!client) return;
  // Remove stale registration — client may have been recreated after reconnect
  listenersRegistered.delete(userId);
  listenersRegistered.add(userId);

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const message = event.message;
      if (!message || message.out) return;

      const state = getState(userId);
      // GramJS MTProto uses positive BigInt IDs — toString() gives clean number string
      const peerId = message.chatId?.toString() ?? message.senderId?.toString() ?? '';
      if (!peerId) return;

      const isActiveChat = state.activeChat?.peerId === peerId;
      const isSubscribed = (state.notifications ?? []).includes(peerId);
      const shouldSendDirect = isActiveChat || isSubscribed;

      // Resolve sender name (skip API call for active chat — we already know the name)
      let senderName = state.activeChat?.peerId === peerId
        ? state.activeChat.peerName
        : 'ناشناس';

      if (!isActiveChat) {
        try {
          const sender = await message.getSender();
          if (sender && 'firstName' in sender) {
            senderName = [(sender as any).firstName, (sender as any).lastName]
              .filter(Boolean).join(' ') || (sender as any).username || 'ناشناس';
          } else if (sender && 'title' in sender) {
            senderName = (sender as any).title;
          }
        } catch { /* ignore */ }
      }

      const text = message.message ?? '';
      const tgMsgId: number = message.id;

      if (shouldSendDirect) {
        if (message.media) {
          await forwardMedia(userId, tgMsgId, message, client, bot, senderName);
        } else if (text) {
          const sent = await bot.api.sendMessage(userId, `👤 ${senderName}:\n${text}`);
          storeReply(userId, sent.message_id, tgMsgId);
        }
      } else {
        // Notification with quick-open button
        const keyboard = new InlineKeyboard().text('📂 باز کردن چت', `open_chat:${peerId}`);
        const preview = text
          ? ` — ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`
          : ' — (رسانه)';
        await bot.api.sendMessage(
          userId,
          `🔔 ${senderName}${preview}`,
          { reply_markup: keyboard }
        );
      }
    } catch { /* never crash the listener */ }
  }, new NewMessage({}));
}

async function forwardMedia(
  userId: number,
  tgMsgId: number,
  message: any,
  client: any,
  bot: Bot,
  senderName: string
): Promise<void> {
  const originalCaption = message.message ?? '';
  const caption = originalCaption
    ? `👤 ${senderName}:\n${originalCaption}`
    : `👤 ${senderName}`;

  try {
    const buffer = await client.downloadMedia(message, {}) as Buffer | null;
    if (!buffer || buffer.length === 0) {
      await bot.api.sendMessage(userId, `👤 ${senderName}: 📎 (رسانه قابل دانلود نیست)`);
      return;
    }

    const media = message.media;
    let sent: { message_id: number };

    if (media instanceof Api.MessageMediaPhoto) {
      sent = await bot.api.sendPhoto(userId, new InputFile(buffer, 'photo.jpg'), { caption });
    } else if (media instanceof Api.MessageMediaDocument) {
      const doc = media.document;
      const mimeType: string = (doc && 'mimeType' in doc) ? (doc as any).mimeType : '';
      const attrs: any[] = (doc && 'attributes' in doc) ? (doc as any).attributes : [];
      const fnAttr = attrs.find((a: any) => a.className === 'DocumentAttributeFilename');
      const fileName: string = fnAttr?.fileName ?? nameFromMime(mimeType);

      if (mimeType.startsWith('video/')) {
        sent = await bot.api.sendVideo(userId, new InputFile(buffer, fileName), { caption });
      } else if (mimeType.startsWith('audio/')) {
        sent = await bot.api.sendAudio(userId, new InputFile(buffer, fileName), { caption });
      } else if (mimeType.startsWith('image/')) {
        sent = await bot.api.sendPhoto(userId, new InputFile(buffer, fileName), { caption });
      } else {
        sent = await bot.api.sendDocument(userId, new InputFile(buffer, fileName), { caption });
      }
    } else {
      // Sticker, location, etc.
      sent = await bot.api.sendMessage(userId, caption);
    }

    storeReply(userId, sent.message_id, tgMsgId);
  } catch {
    await bot.api.sendMessage(userId, `👤 ${senderName}: 📎 (خطا در دریافت رسانه)`);
  }
}

function nameFromMime(mime: string): string {
  const ext = mime.split('/')[1] ?? 'bin';
  if (mime.startsWith('image/')) return `image.${ext}`;
  if (mime.startsWith('video/')) return `video.${ext}`;
  if (mime.startsWith('audio/')) return `audio.${ext}`;
  return `file.${ext}`;
}

export function unregisterListener(userId: number): void {
  listenersRegistered.delete(userId);
}
