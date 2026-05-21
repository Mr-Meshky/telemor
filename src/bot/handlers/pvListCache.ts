export interface DialogItem {
  peerId: string;
  name: string;
  unreadCount: number;
  type: 'user' | 'channel';
}

export const dialogCache = new Map<number, { items: DialogItem[]; ts: number }>();
export const CACHE_TTL = 2 * 60 * 1000;
