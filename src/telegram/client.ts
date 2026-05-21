import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { getState, setState } from '../state/index.js';

const clients = new Map<number, TelegramClient>();

export function getClient(userId: number): TelegramClient | null {
  return clients.get(userId) ?? null;
}

export async function createClient(
  userId: number,
  apiId: number,
  apiHash: string,
  session: string = ''
): Promise<TelegramClient> {
  const existing = clients.get(userId);
  if (existing) {
    try { await existing.disconnect(); } catch { /* ignore */ }
    clients.delete(userId);
  }

  const stringSession = new StringSession(session);
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  clients.set(userId, client);
  return client;
}

export async function disconnectClient(userId: number): Promise<void> {
  const client = clients.get(userId);
  if (client) {
    try { await client.disconnect(); } catch { /* ignore */ }
    clients.delete(userId);
  }
}

export async function reconnectSavedSessions(): Promise<void> {
  // Reconnect is handled lazily when user interacts
  // We just verify existing sessions from state on demand
}

export async function ensureConnected(userId: number): Promise<TelegramClient | null> {
  const state = getState(userId);
  if (!state.telegramSession || !state.apiId || !state.apiHash) return null;

  let client = clients.get(userId);
  if (!client) {
    client = await createClient(userId, state.apiId, state.apiHash, state.telegramSession);
    try {
      await client.connect();
      const newSession = (client.session as StringSession).save();
      if (newSession !== state.telegramSession) {
        setState(userId, { telegramSession: newSession });
      }
    } catch (err) {
      clients.delete(userId);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('AUTH_KEY_UNREGISTERED') || msg.includes('AUTH_KEY_INVALID')) {
        setState(userId, { telegramSession: null, loginStep: 'idle' });
      }
      return null;
    }
  }

  if (!client.connected) {
    try {
      await client.connect();
    } catch (err) {
      clients.delete(userId);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('AUTH_KEY_UNREGISTERED') || msg.includes('AUTH_KEY_INVALID')) {
        setState(userId, { telegramSession: null, loginStep: 'idle' });
      }
      return null;
    }
  }

  return client;
}

export function saveSession(userId: number): void {
  const client = clients.get(userId);
  if (!client) return;
  const session = (client.session as StringSession).save();
  setState(userId, { telegramSession: session });
}
