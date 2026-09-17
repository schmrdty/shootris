'use client';

import { useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect, type Connector } from 'wagmi';
import { Avatar, Name } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QrCode, Wallet as WalletIcon } from 'lucide-react';

/**
 * Wallet picker built from the wallet connectors this browser actually has.
 *
 * OnchainKit's own modal lists a fixed set (Coinbase, MetaMask, Phantom, and
 * optionally Rabby/Trust/Frame), so wallets like Rainbow and Zerion never
 * appeared however they were installed. wagmi discovers installed browser
 * wallets through EIP-6963, so listing its connectors shows whatever is
 * really there — and adds WalletConnect's QR code when configured.
 */

const FARCASTER_IDS = new Set(['farcaster', 'farcasterFrame', 'farcasterMiniApp']);
// Coinbase Wallet and "Base Account" are the same product; Coinbase renamed
// the app back to Coinbase Wallet, so show one entry under that name.
const COINBASE_IDS = new Set(['coinbaseWalletSDK', 'coinbaseWallet', 'baseAccount', 'com.coinbase.wallet']);

function displayName(connector: Connector): string {
  if (COINBASE_IDS.has(connector.id)) return 'Coinbase Wallet';
  if (connector.id === 'walletConnect') return 'Scan with a mobile wallet';
  if (connector.id === 'injected') return 'Browser wallet';
  return connector.name;
}

export function ConnectWalletButton({ className = '', label = 'Connect Wallet' }: { className?: string; label?: string }) {
  const { address } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const { options, fallback } = useMemo(() => {
    const seen = new Set<string>();
    const list: Connector[] = [];
    let hasDiscovered = false;

    for (const connector of connectors) {
      // The embedded Farcaster wallet connects itself inside a mini app
      if (FARCASTER_IDS.has(connector.id) || FARCASTER_IDS.has(connector.type)) continue;
      // One Coinbase entry, whichever variant wagmi offers first
      const key = COINBASE_IDS.has(connector.id) ? 'coinbase' : connector.id;
      if (seen.has(key)) continue;
      seen.add(key);
      if (connector.id !== 'injected' && connector.id !== 'walletConnect' && !COINBASE_IDS.has(connector.id)) {
        hasDiscovered = true; // an actual installed wallet announced itself
      }
      list.push(connector);
    }

    // The generic "Browser wallet" entry usually duplicates a named wallet
    // above, so it drops out of the main list once anything announced
    // itself. It stays available underneath as a fallback, because a wallet
    // that only exposes window.ethereum would otherwise be unreachable.
    const rank = (c: Connector) => (COINBASE_IDS.has(c.id) ? 0 : c.id === 'walletConnect' ? 2 : 1);
    const injectedEntry = hasDiscovered ? list.find((c) => c.id === 'injected') : undefined;
    const main = (hasDiscovered ? list.filter((c) => c.id !== 'injected') : list).sort(
      (a, b) => rank(a) - rank(b)
    );
    return { options: main, fallback: injectedEntry };
  }, [connectors]);

  const openPicker = () => {
    setFailed(null);
    setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={openPicker} className={className}>
        {address ? (
          <span className="flex items-center gap-2">
            <Avatar address={address} chain={base} className="h-6 w-6" />
            <Name address={address} chain={base} className="font-bold" />
          </span>
        ) : (
          label
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm bg-gray-950 border-cyan-500/60">
          <DialogHeader>
            <DialogTitle className="text-cyan-300">{address ? 'Wallet' : 'Connect a wallet'}</DialogTitle>
            <DialogDescription className="text-gray-400">
              {address ? 'Connected to Shootris.' : 'Pick a wallet to save scores and use $MYU.'}
            </DialogDescription>
          </DialogHeader>

          {address ? (
            <div className="space-y-3">
              <p className="break-all rounded border border-gray-800 p-2 font-mono text-xs text-gray-300">{address}</p>
              <Button
                variant="outline"
                className="w-full border-red-500 text-red-400"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {options.map((connector) => (
                <button
                  key={connector.uid}
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    connect(
                      { connector },
                      {
                        onSuccess: () => setOpen(false),
                        onError: (e) => setFailed(e.message),
                      }
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-lg border border-gray-700 bg-black/60 px-4 py-3 text-left font-bold text-white transition-colors hover:border-cyan-400 disabled:opacity-50"
                >
                  {connector.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={connector.icon} alt="" className="h-6 w-6 rounded" />
                  ) : connector.id === 'walletConnect' ? (
                    <QrCode className="h-6 w-6 text-cyan-300" aria-hidden="true" />
                  ) : (
                    <WalletIcon className="h-6 w-6 text-cyan-300" aria-hidden="true" />
                  )}
                  <span className="flex-1">{displayName(connector)}</span>
                </button>
              ))}
              {options.length === 0 && !fallback && (
                <p className="text-sm text-yellow-400">
                  No wallet found in this browser. Install one, or open Shootris in Farcaster or the Coinbase Wallet app.
                </p>
              )}
              {fallback && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    connect(
                      { connector: fallback },
                      {
                        onSuccess: () => setOpen(false),
                        onError: (e) => setFailed(e.message),
                      }
                    )
                  }
                  className="w-full pt-1 text-center text-xs text-gray-400 underline transition-colors hover:text-cyan-300 disabled:opacity-50"
                >
                  My wallet is not listed
                </button>
              )}
              {failed && <p className="text-sm text-red-400">{failed}</p>}
              <p className="pt-1 text-center text-[11px] text-gray-500">
                Connecting a wallet implies acceptance of the Terms of Service.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
