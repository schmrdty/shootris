'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { base, mainnet } from 'wagmi/chains';
import { createPublicClient } from 'viem';
import { ONCHAINKIT_API_KEY, ONCHAINKIT_PROJECT_ID } from './config/onchainkit';
import { GameThemeProvider } from '@/lib/theme';
import { CollectionProvider } from '@/lib/collection';
import { WalletReconnect } from '@/components/WalletReconnect';
import { BaseChainGuard } from '@/components/BaseChainGuard';
import { WalletDebug } from '@/components/WalletDebug';
import { logWallet } from '@/lib/walletLog';

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
    // One Coinbase entry: "Base Account" is the same product, renamed back
    // to Coinbase Wallet. preference 'all' covers the smart wallet, the
    // extension and the mobile app.
    coinbaseWallet({ appName: 'Shootris', preference: 'all' }),
    // WalletConnect is deliberately NOT in this list. A connector configured
    // here joins wagmi's reconnect path, which runs on every page load, and
    // the WalletConnect provider phones home to Reown the moment it is
    // initialised (with showQrModal it also pulls the whole AppKit UI and
    // its Google Fonts). Inside a Farcaster/Base mini-app webview that
    // load-time work can stall reconnect and leave the app stuck on its
    // splash screen. The QR option is instead created on demand, at the
    // moment the player taps it, in ConnectWalletButton.
    // MetaMask is deliberately absent: its SDK connector can hang forever
    // inside a mini-app webview, which stalls wagmi's reconnect for
    // everyone. injected() picks up the MetaMask extension through EIP-6963,
    // and the OnchainKit wallet modal creates a MetaMask connector on demand.
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

// Record every wallet state change, so a drop can be diagnosed on the
// device it happened on (any page with ?debug=1).
if (typeof window !== 'undefined') {
  wagmiConfig.subscribe(
    (state) => ({ status: state.status, connector: state.current }),
    ({ status, connector }) => logWallet(`status=${status}`, `connector=${connector ?? 'none'}`),
    { equalityFn: (a, b) => a.status === b.status && a.connector === b.connector }
  );
}

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
  // The embeddable mini-game is network-free and wallet-free by design, so
  // it skips the wallet/onchain providers entirely (see app/mini/page.tsx).
  const pathname = usePathname();
  if (pathname?.startsWith('/mini')) return <>{children}</>;

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
          <WalletReconnect />
          <BaseChainGuard />
          <WalletDebug />
          <CollectionProvider>
            <GameThemeProvider>{children}</GameThemeProvider>
          </CollectionProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
