// Where players can find Shootris and its data.
//
// Blank entries are simply not rendered, so a link can be added here
// without touching the pages that show them.

export const X_PROFILE_URL = 'https://x.com/schmidtiest';

export const FARCASTER_PROFILE_URL = 'https://farcaster.xyz/schmidtiest.eth';

/**
 * The public standings, as JSON. The SpacetimeDB dashboard is not public
 * (it 404s for anyone not signed in as the owner), so this is the link that
 * actually lets a player, or another app, read the data behind the board.
 */
export const LEADERBOARD_API_PATH = '/api/leaderboard';
