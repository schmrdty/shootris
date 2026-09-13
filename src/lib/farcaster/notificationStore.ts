import { promises as fs } from 'fs';
import path from 'path';

// Farcaster notification tokens, one per (user fid, client app fid).
// Tokens let this server push notifications to that user, so they stay
// server-side: a JSON file on the container's persistent data volume.

export interface NotificationToken {
  url: string;
  token: string;
  updatedAt: string;
}

type Store = Record<string, NotificationToken>; // key: `${fid}:${appFid}`

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'notification-tokens.json');

let queue: Promise<unknown> = Promise.resolve();

async function read(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8')) as Store;
  } catch {
    return {};
  }
}

// Serialize writes so concurrent webhook calls can't clobber each other
function update(mutate: (store: Store) => void): Promise<void> {
  const run = queue.then(async () => {
    const store = await read();
    mutate(store);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
    await fs.rename(tmp, FILE);
  });
  queue = run.catch(() => undefined);
  return run;
}

const keyOf = (fid: number, appFid: number) => `${fid}:${appFid}`;

export function saveToken(fid: number, appFid: number, details: { url: string; token: string }) {
  return update((s) => {
    s[keyOf(fid, appFid)] = { url: details.url, token: details.token, updatedAt: new Date().toISOString() };
  });
}

export function removeToken(fid: number, appFid: number) {
  return update((s) => {
    delete s[keyOf(fid, appFid)];
  });
}

export async function listTokens(): Promise<Array<{ fid: number; appFid: number } & NotificationToken>> {
  const store = await read();
  return Object.entries(store).map(([k, v]) => {
    const [fid, appFid] = k.split(':').map(Number);
    return { fid, appFid, ...v };
  });
}
