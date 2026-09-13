'use client';

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { baseAccount, coinbaseWallet, injected, metaMask } from 'wagmi/connectors';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { base, mainnet } from 'wagmi/chains';
import { createPublicClient } from 'viem';
import { ONCHAINKIT_API_KEY, ONCHAINKIT_PROJECT_ID } from './config/onchainkit';
import { GameThemeProvider } from '@/lib/theme';
import { CollectionProvider } from '@/lib/collection';

// Connector order matters: OnchainKit's MiniKit auto-connects connectors[0]
// when running inside a Farcaster/Base mini app, so the embedded wallet goes
// first. On the open web, the OnchainKit wallet modal lets players pick any
// of the rest — smart wallets (Base Account, Coinbase Smart Wallet) and EOAs
// (Coinbase Wallet extension, MetaMask, Rabby, Phantom, Trust, any injected).
// Browser-extension wallets are also discovered automatically via EIP-6963.
const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    farcasterMiniApp(),
    baseAccount({ appName: 'Shootris' }),
    coinbaseWallet({ appName: 'Shootris', preference: 'all' }),
    metaMask({ dappMetadata: { name: 'Shootris' } }),
    injected(),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: false,
});

// ENS names on the leaderboard resolve in the browser against Ethereum
// mainnet. viem's default mainnet RPC rejects browser (CORS) requests, so
// hand OnchainKit one that allows them. Must be a PUBLIC endpoint — anything
// set here ships to every visitor, so never put a keyed RPC URL in it.
const publicClients = {
  [mainnet.id]: createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth.drpc.org'),
  }),
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5_000,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={ONCHAINKIT_API_KEY}
          projectId={ONCHAINKIT_PROJECT_ID}
          chain={base}
          defaultPublicClients={publicClients}
          config={{
            appearance: {
              name: 'Shootris',
              mode: 'dark',
              theme: 'cyberpunk',
              logo: '/brand/icon-512.png',
            },
            wallet: {
              // Modal offers every wallet type on the web; inside a mini app
              // OnchainKit skips it and uses the embedded wallet instead.
              display: 'modal',
              preference: 'all',
              termsUrl: '/terms',
              supportedWallets: { rabby: true, trust: true, frame: true },
            },
          }}
          miniKit={{
            enabled: true,
            autoConnect: true,
          }}
        >
          <CollectionProvider>
            <GameThemeProvider>{children}</GameThemeProvider>
          </CollectionProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
