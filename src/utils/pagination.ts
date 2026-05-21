import { InlineKeyboard } from 'grammy';

export const PAGE_SIZE = 10;

export function paginationButtons(
  page: number,
  totalItems: number,
  prevCb: string,
  nextCb: string,
  backCb: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < totalItems;

  if (hasPrev || hasNext) {
    if (hasPrev) keyboard.text('◀️ قبلی', prevCb);
    if (hasNext) keyboard.text('▶️ بعدی', nextCb);
    keyboard.row();
  }

  keyboard.text('🔙 برگشت', backCb);
  return keyboard;
}
