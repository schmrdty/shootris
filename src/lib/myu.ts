import { formatUnits } from 'viem';
import { MYU_DECIMALS } from '@/app/config/onchainkit';

/**
 * A $MYU balance as a player should read it: grouped digits, two decimals.
 *
 * Balances are held as bigint wei. Dividing that by 10 ** decimals in
 * JavaScript overflows a number's precision, so a real balance of
 * 2702237597.499283518557415015 printed as 2702237597.499284, with no
 * separators. formatUnits does the conversion exactly, and the rounding
 * that follows is only ever for display.
 */
export function formatMyu(raw: bigint): string {
  const exact = formatUnits(raw, MYU_DECIMALS);
  return Number(exact).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
