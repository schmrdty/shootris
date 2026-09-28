import { MYU_DECIMALS } from '@/app/config/onchainkit';

/**
 * A $MYU balance as a player should read it: grouped whole tokens.
 *
 * Fractions of a token only matter while swapping, where the swap widget
 * shows its own precise amounts. Everywhere else they are noise: a continue
 * costs 10,000, so what a player needs to know is whether they have it.
 *
 * Balances are held as bigint wei. Dividing that by 10 ** decimals in
 * JavaScript overflows a number's precision, so a real balance of
 * 2702237597.499283518557415015 printed as 2702237597.499284, with no
 * separators. formatUnits converts exactly; the rounding is display only.
 *
 * Rounded DOWN, so a balance can never read as enough to continue when it
 * is a fraction short.
 */
export function formatMyu(raw: bigint): string {
  const whole = raw / 10n ** BigInt(MYU_DECIMALS);
  return whole.toLocaleString('en-US');
}
