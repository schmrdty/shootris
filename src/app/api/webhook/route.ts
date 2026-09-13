import { NextResponse } from 'next/server';
import { parseWebhookEvent } from '@farcaster/miniapp-node';
import { verifyAppKey } from '@/lib/farcaster/verifyAppKey';
import { removeToken, saveToken } from '@/lib/farcaster/notificationStore';

// Farcaster / Base App mini-app webhook (manifest "webhookUrl").
// Clients POST a signed event when a user adds or removes Shootris or
// toggles its notifications. The signature is verified before anything is
// stored.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let parsed: Awaited<ReturnType<typeof parseWebhookEvent>>;
  try {
    parsed = await parseWebhookEvent(body, verifyAppKey);
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
    console.warn('Webhook rejected:', name || error, cause);
    // Bad signature / unknown key → 401; malformed event → 400; our RPC failing → 500 so the client retries
    if (name.includes('InvalidDataError') || name.includes('InvalidEventDataError')) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }
    if (name.includes('InvalidAppKeyError')) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }

  const { fid, appFid, event } = parsed;
  switch (event.event) {
    case 'miniapp_added':
      if (event.notificationDetails) await saveToken(fid, appFid, event.notificationDetails);
      break;
    case 'notifications_enabled':
      await saveToken(fid, appFid, event.notificationDetails);
      break;
    case 'miniapp_removed':
    case 'notifications_disabled':
      await removeToken(fid, appFid);
      break;
  }
  return NextResponse.json({ success: true });
}
