'use client';

// Cast-share links for Shootris. The embed is the site itself: Farcaster
// clients unfurl it into a "Play Shootris" mini-app card using the
// fc:miniapp tags in app/layout.tsx.

export const SITE_URL = `https://${process.env.NEXT_PUBLIC_HOST || 'shootris.schmidtiest.xyz'}`;

export const DEFAULT_CAST_TEXT =
  'Playing Shootris: Tetris flipped upside down. Pieces rise, you shoot them into place. Beat my score?';

/** Web composer link — works from any browser, opens a draft cast. */
export function castShareUrl(text: string = DEFAULT_CAST_TEXT, embed: string = SITE_URL): string {
  const params = new URLSearchParams();
  params.set('text', text);
  params.append('embeds[]', embed);
  return `https://farcaster.xyz/~/compose?${params.toString()}`;
}

/**
 * Open a cast composer with `text`. Inside Farcaster / the Base App this is
 * the native composer; on the web it is a new tab. Never navigates the
 * current page, so a game in progress is not lost.
 */
export async function shareCast(text: string = DEFAULT_CAST_TEXT, embed: string = SITE_URL): Promise<void> {
  try {
    const { sdk } = await import('@farcaster/miniapp-sdk');
    if (await sdk.isInMiniApp()) {
      await sdk.actions.composeCast({ text, embeds: [embed] });
      return;
    }
  } catch {
    // not in a mini app, or the host refused — fall through to the web
  }
  window.open(castShareUrl(text, embed), '_blank', 'noopener');
}
