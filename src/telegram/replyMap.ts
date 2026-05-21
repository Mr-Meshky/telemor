// Maps Bale message IDs → Telegram message IDs for reply support.
// Scoped per user. Not persisted — mapping lives for bot uptime only.

const MAX_ENTRIES = 200;

const store = new Map<number, Map<number, number>>();

export function storeReply(userId: number, baleMsgId: number, tgMsgId: number): void {
  if (!store.has(userId)) store.set(userId, new Map());
  const map = store.get(userId)!;
  map.set(baleMsgId, tgMsgId);
  // Evict oldest entries if over limit
  if (map.size > MAX_ENTRIES) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
}

export function getTgMsgId(userId: number, baleMsgId: number): number | undefined {
  return store.get(userId)?.get(baleMsgId);
}
