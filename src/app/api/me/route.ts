import { NextRequest, NextResponse } from 'next/server';
import { createClient, Errors } from '@farcaster/quick-auth';
import { createPublicClient, http, isAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { getChainRegistry } from '@/lib/chains';

const client = createClient();

interface Profile {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  primaryAddress?: string;
  ensName?: string;
}

// Profiles change rarely; avoid refetching on every page load
const PROFILE_TTL_MS = 10 * 60 * 1000;
const profileCache = new Map<number, { at: number; profile: Profile }>();

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function lookupProfile(fid: number): Promise<Profile> {
  const cached = profileCache.get(fid);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.profile;

  const profile: Profile = { fid };
  // Farcaster's public client API: username, display name, avatar
  try {
    const data = (await fetchJson(`https://api.farcaster.xyz/v2/user?fid=${fid}`)) as {
      result?: { user?: { username?: string; displayName?: string; pfp?: { url?: string } } };
    };
    const user = data.result?.user;
    profile.username = user?.username || undefined;
    profile.displayName = user?.displayName || undefined;
    profile.pfpUrl = user?.pfp?.url || undefined;
  } catch (error) {
    console.warn('Farcaster profile lookup failed:', error instanceof Error ? error.message : error);
  }
  // Primary verified Ethereum address, plus its ENS name when no username
  try {
    const data = (await fetchJson(`https://api.farcaster.xyz/fc/primary-address?fid=${fid}&protocol=ethereum`)) as {
      result?: { address?: { address?: string } };
    };
    const address = data.result?.address?.address;
    if (address && isAddress(address)) {
      profile.primaryAddress = address;
      if (!profile.username) {
        const eth = createPublicClient({ chain: mainnet, transport: http(getChainRegistry().ethereum.rpcUrl) });
        profile.ensName = (await eth.getEnsName({ address })) ?? undefined;
      }
    }
  } catch (error) {
    console.warn('Primary address lookup failed:', error instanceof Error ? error.message : error);
  }

  profileCache.set(fid, { at: Date.now(), profile });
  return profile;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authorization.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    }

    const payload = await client.verifyJwt({
      token,
      domain: process.env.NEXT_PUBLIC_HOST || 'localhost:3000',
    });

    // The fid is verified by the JWT; the profile is public display data
    return NextResponse.json(await lookupProfile(Number(payload.sub)));
  } catch (error) {
    console.error('Authentication error:', error);

    if (error instanceof Errors.InvalidTokenError) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
