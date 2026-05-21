import fs from 'fs';
import path from 'path';

const STATE_FILE = path.resolve('state.json');

export interface ActiveChat {
  peerId: string;
  peerName: string;
  type: 'user' | 'channel';
}

export type LoginStep =
  | 'idle'
  | 'waiting_api_id'
  | 'waiting_api_hash'
  | 'waiting_phone'
  | 'waiting_code'
  | 'waiting_2fa'
  | 'done';

export interface UserState {
  telegramSession: string | null;
  apiId: number | null;
  apiHash: string | null;
  phone: string | null;
  activeChat: ActiveChat | null;
  pvPage: number;
  channelPage: number;
  loginStep: LoginStep;
  loginData: Partial<{ apiId: number; apiHash: string; phone: string }>;
  // peerIds that user wants direct message forwarding from (even outside active chat)
  notifications: string[];
  loginTimeout?: NodeJS.Timeout;
}

function defaultState(): UserState {
  return {
    telegramSession: null,
    apiId: null,
    apiHash: null,
    phone: null,
    activeChat: null,
    pvPage: 0,
    channelPage: 0,
    loginStep: 'idle',
    loginData: {},
    notifications: [],
  };
}

const states = new Map<number, UserState>();

function loadFromDisk(): void {
  if (!fs.existsSync(STATE_FILE)) return;
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed: Record<string, Omit<UserState, 'loginTimeout'>> = JSON.parse(raw);
    for (const [key, value] of Object.entries(parsed)) {
      states.set(Number(key), { ...defaultState(), ...value });
    }
  } catch {
    /* corrupt file — start fresh */
  }
}

function saveToDisk(): void {
  const obj: Record<string, Omit<UserState, 'loginTimeout'>> = {};
  for (const [key, value] of states.entries()) {
    const { loginTimeout: _, ...rest } = value;
    obj[String(key)] = rest;
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2));
}

export function getState(userId: number): UserState {
  if (!states.has(userId)) states.set(userId, defaultState());
  return states.get(userId)!;
}

export function setState(userId: number, partial: Partial<UserState>): void {
  const current = getState(userId);
  states.set(userId, { ...current, ...partial });
  saveToDisk();
}

export function resetLoginState(userId: number): void {
  const state = getState(userId);
  if (state.loginTimeout) clearTimeout(state.loginTimeout);
  setState(userId, { loginStep: 'idle', loginData: {}, loginTimeout: undefined });
}

export function setLoginTimeout(userId: number, ms: number, onTimeout: () => void): void {
  const state = getState(userId);
  if (state.loginTimeout) clearTimeout(state.loginTimeout);
  const t = setTimeout(() => {
    resetLoginState(userId);
    onTimeout();
  }, ms);
  states.get(userId)!.loginTimeout = t;
}

export function clearLoginTimeout(userId: number): void {
  const state = getState(userId);
  if (state.loginTimeout) {
    clearTimeout(state.loginTimeout);
    states.get(userId)!.loginTimeout = undefined;
  }
}

export function getLoggedInUserIds(): number[] {
  const result: number[] = [];
  for (const [userId, state] of states.entries()) {
    if (state.loginStep === 'done' && state.telegramSession) result.push(userId);
  }
  return result;
}

export function toggleNotification(userId: number, peerId: string): boolean {
  const state = getState(userId);
  const notifs = [...(state.notifications ?? [])];
  const idx = notifs.indexOf(peerId);
  if (idx >= 0) {
    notifs.splice(idx, 1);
    setState(userId, { notifications: notifs });
    return false; // now off
  } else {
    notifs.push(peerId);
    setState(userId, { notifications: notifs });
    return true; // now on
  }
}

export { loadFromDisk, saveToDisk };
