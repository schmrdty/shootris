// Where players can find Shootris and its data.
//
// Blank entries are simply not rendered, so a link can be added here
// without touching the pages that show them.

/** Ryan's X profile, e.g. https://x.com/<handle> */
export const X_PROFILE_URL = '';

/** Ryan's Farcaster profile, e.g. https://farcaster.xyz/<handle> */
export const FARCASTER_PROFILE_URL = '';

/**
 * The public standings, as JSON. The SpacetimeDB dashboard is not public
 * (it 404s for anyone not signed in as the owner), so this is the link that
 * actually lets a player, or another app, read the data behind the board.
 */
export const LEADERBOARD_API_PATH = '/api/leaderboard';
