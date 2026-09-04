'use client';

import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownDisconnect } from '@coinbase/onchainkit/wallet';
import { Avatar, Name, Identity, Address } from '@coinbase/onchainkit/identity';
import { useAccount } from 'wagmi';

export function WalletConnect() {
  const { address } = useAccount();

  return (
    <div className="flex items-center justify-end gap-4">
      <Wallet>
        <ConnectWallet className="bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all">
          <Avatar className="h-6 w-6" />
          <Name className="font-bold" />
        </ConnectWallet>
        <WalletDropdown>
          <Identity
            address={address}
            className="bg-black/90 border border-purple-500 rounded-lg p-4"
            hasCopyAddressOnClick
          >
            <Avatar />
            <Name className="font-bold text-white" />
            <Address className="text-gray-400" />
          </Identity>
          <WalletDropdownDisconnect className="bg-red-500/80 hover:bg-red-600 text-white font-bold mt-2" />
        </WalletDropdown>
      </Wallet>
    </div>
  );
}
