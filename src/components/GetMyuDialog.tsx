'use client';

import {
  Swap,
  SwapAmountInput,
  SwapToggleButton,
  SwapButton,
  SwapMessage,
  SwapToast,
} from '@coinbase/onchainkit/swap';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MYU_TOKEN, SWAP_FROM_TOKENS, MYU_CONFIGURED } from '@/app/config/onchainkit';

interface GetMyuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwapSuccess?: () => void;
}

export function GetMyuDialog({ open, onOpenChange, onSwapSuccess }: GetMyuDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-cyan-500 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl text-cyan-400">Get $MYU</DialogTitle>
          <DialogDescription className="text-gray-300">
            Swap ETH or other tokens you hold on Base for $MYU — no need to leave the game.
          </DialogDescription>
        </DialogHeader>
        {MYU_CONFIGURED ? (
          <Swap
            onSuccess={() => {
              onSwapSuccess?.();
            }}
          >
            <SwapAmountInput
              label="Sell"
              swappableTokens={SWAP_FROM_TOKENS}
              token={SWAP_FROM_TOKENS[0]}
              type="from"
            />
            <SwapToggleButton />
            <SwapAmountInput label="Buy" token={MYU_TOKEN} type="to" />
            <SwapButton />
            <SwapMessage />
            <SwapToast />
          </Swap>
        ) : (
          <p className="text-center text-yellow-400 py-6">
            $MYU token address is not configured yet. Set NEXT_PUBLIC_MYU_TOKEN_ADDRESS and redeploy.
          </p>
        )}
        <p className="text-xs text-gray-500 text-center">
          Swaps are routed on-chain via decentralized exchanges on Base. Prices and slippage are set
          by the market, not by Shootris. All swaps are final.
        </p>
      </DialogContent>
    </Dialog>
  );
}
