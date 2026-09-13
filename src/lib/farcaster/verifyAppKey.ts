import { createPublicClient, decodeAbiParameters, http, parseAbi, parseAbiItem, keccak256 } from 'viem';
import { optimism } from 'viem/chains';
import { verifyAppKeyWithNeynar, type VerifyAppKey } from '@farcaster/miniapp-node';
import { getChainRegistry } from '@/lib/chains';

// A webhook event is signed by an app key (a Farcaster signer). It is only
// genuine if that key is currently registered to the user's fid in
// Farcaster's KeyRegistry on OP Mainnet. Checked directly onchain, so no
// third-party API is required; with NEYNAR_API_KEY set, Neynar's hub is
// used instead.

const KEY_REGISTRY = '0x00000000Fc1237824fb747aBDE0FF18990E59b7e';
// KeyRegistry deploy block on OP Mainnet, so log lookups stay bounded
const KEY_REGISTRY_FROM_BLOCK = BigInt(111_816_359);
const KEY_STATE_ADDED = 1;
const KEY_TYPE_ED25519 = 1;

const registryAbi = parseAbi([
  'function keyDataOf(uint256 fid, bytes key) view returns ((uint8 state, uint32 keyType))',
]);
const addEvent = parseAbiItem(
  'event Add(uint256 indexed fid, uint32 indexed keyType, bytes indexed key, bytes keyBytes, uint8 indexed metadataType, bytes metadata)'
);
const signedKeyRequestMetadata = [
  {
    type: 'tuple',
    components: [
      { name: 'requestFid', type: 'uint256' },
      { name: 'requestSigner', type: 'address' },
      { name: 'signature', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
] as const;

const verifyAppKeyOnchain: VerifyAppKey = async (fid, appKey) => {
  const client = createPublicClient({ chain: optimism, transport: http(getChainRegistry().optimism.rpcUrl) });
  const key = appKey as `0x${string}`;

  const data = await client.readContract({
    address: KEY_REGISTRY,
    abi: registryAbi,
    functionName: 'keyDataOf',
    args: [BigInt(fid), key],
  });
  if (data.state !== KEY_STATE_ADDED || data.keyType !== KEY_TYPE_ED25519) return { valid: false };

  // Which app (client) added this signer — lets tokens be kept per client
  let appFid = 0;
  try {
    const logs = await client.getLogs({
      address: KEY_REGISTRY,
      event: addEvent,
      args: { fid: BigInt(fid), key: keccak256(key) as never },
      fromBlock: KEY_REGISTRY_FROM_BLOCK,
      toBlock: 'latest',
    });
    const metadata = logs.at(-1)?.args.metadata;
    if (metadata) appFid = Number(decodeAbiParameters(signedKeyRequestMetadata, metadata)[0].requestFid);
  } catch {
    // Public RPCs may refuse the wide log range; the key itself is still verified
  }
  return { valid: true, appFid };
};

export const verifyAppKey: VerifyAppKey = (fid, appKey) =>
  process.env.NEYNAR_API_KEY ? verifyAppKeyWithNeynar(fid, appKey) : verifyAppKeyOnchain(fid, appKey);
