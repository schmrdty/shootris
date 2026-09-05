import type { Token } from '@coinbase/onchainkit/token';
import { base } from 'wagmi/chains';

export const ONCHAINKIT_API_KEY = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || '';
export const ONCHAINKIT_PROJECT_ID = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_ID || '';
export const PAYOUT_SPLIT_ADDRESS = process.env.NEXT_PUBLIC_PAYOUT_SPLIT_ADDRESS || '0x0000000000000000000000000000000000000000';
export const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const SPACETIME_MODULE_NAME = 'shootris-game';
export const SPACETIME_HOST = 'maincloud';
export const SPACETIME_IDENTITY = 'c20030f936d903511ff3c178726a88a1faa2ec2354d079df8aa6a2bd7bd6da2f';

// $MYU — set NEXT_PUBLIC_MYU_TOKEN_ADDRESS to the MYU contract on Base
export const MYU_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_MYU_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000';
export const MYU_DECIMALS = Number(process.env.NEXT_PUBLIC_MYU_DECIMALS || 18);
// Whole-token price of one continue, e.g. '100' = 100 MYU (either env name works)
export const CONTINUE_PRICE_MYU = process.env.NEXT_PUBLIC_CONTINUE_PRICE_MYU || process.env.NEXT_PUBLIC_CONTINUE_PRICE || '100';
// Whole-token PvP entry fee per match/queue entry; '0' disables the fee
export const PVP_ENTRY_FEE_MYU = process.env.NEXT_PUBLIC_PVP_ENTRY_FEE_MYU || '0';
export const MYU_CONFIGURED = MYU_TOKEN_ADDRESS !== '0x0000000000000000000000000000000000000000';

export const MYU_TOKEN: Token = {
  address: MYU_TOKEN_ADDRESS as `0x${string}`,
  chainId: base.id,
  decimals: MYU_DECIMALS,
  name: 'MYU',
  symbol: 'MYU',
  image: '',
};

// Tokens players can sell for MYU inside the app (Base mainnet)
export const SWAP_FROM_TOKENS: Token[] = [
  { address: '', chainId: base.id, decimals: 18, name: 'Ethereum', symbol: 'ETH', image: 'https://dynamic-assets.coinbase.com/dbb4b4983bde81309ddab83eb598358eb44375b930b94687ebe38bc22e52c3b2125258ffb8477a5ef22e33d6bd72e32a506c391caa13af64c00e46613c3e5806/asset_icons/4113b082d21cc5fab17fc8f2d19fb996165bcce635e6900f7fc2d57c4ef33ae9.png' },
  { address: USDC_BASE_ADDRESS as `0x${string}`, chainId: base.id, decimals: 6, name: 'USD Coin', symbol: 'USDC', image: 'https://dynamic-assets.coinbase.com/3c15df5e2ac7d4abbe9499ed9335041f00c620f28e8de2f93474a9f432058742cdf4674bd43f309e69778a26969372310135be97eb183d91c492154176d455b8/asset_icons/9d67b728b6c8f457717154b3a35f9ddc702eae7e76c4684ee39302c4d7fd0bb8.png' },
  { address: '0x4200000000000000000000000000000000000006', chainId: base.id, decimals: 18, name: 'Wrapped Ether', symbol: 'WETH', image: '' },
  { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', chainId: base.id, decimals: 8, name: 'Coinbase Wrapped BTC', symbol: 'cbBTC', image: '' },
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', chainId: base.id, decimals: 18, name: 'Dai', symbol: 'DAI', image: '' },
];
