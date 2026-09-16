'use client';

import { ConnectWalletButton } from '@/components/ConnectWalletButton';

export function WalletConnect() {
  return (
    <div className="flex items-center justify-end gap-4">
      <ConnectWalletButton className="rounded-lg bg-gradient-to-r from-purple-600 to-cyan-600 px-3 py-2 text-sm font-bold text-white shadow-lg transition-all hover:from-purple-500 hover:to-cyan-500 hover:shadow-xl sm:px-6 sm:py-3 sm:text-base" />
    </div>
  );
}
