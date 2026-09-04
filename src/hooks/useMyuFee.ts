'use client';

import { useCallback } from 'react';
import { parseUnits, encodeFunctionData, erc20Abi } from 'viem';
import { useAccount, useReadContract, useSendTransaction } from 'wagmi';
import { base } from 'wagmi/chains';
import {
  MYU_TOKEN_ADDRESS,
  MYU_DECIMALS,
  MYU_CONFIGURED,
  PAYOUT_SPLIT_ADDRESS,
} from '@/app/config/onchainkit';

/**
 * Pay a fixed $MYU fee (whole tokens) to the payout address.
 * `amountWholeTokens` of '0' (or an unconfigured MYU address) disables the fee:
 * `feeRequired` is false and `payFee` resolves without sending a transaction.
 */
export function useMyuFee(amountWholeTokens: string) {
  const { address } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();

  const feeAmount = parseUnits(amountWholeTokens || '0', MYU_DECIMALS);
  const feeRequired = MYU_CONFIGURED && feeAmount > BigInt(0);

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: MYU_TOKEN_ADDRESS as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address && MYU_CONFIGURED },
  });

  const hasEnough = !feeRequired || (balance ?? BigInt(0)) >= feeAmount;

  const payFee = useCallback(async (): Promise<string | null> => {
    if (!feeRequired) return null;
    if (!address) throw new Error('Wallet not connected');
    const txHash = await sendTransactionAsync({
      to: MYU_TOKEN_ADDRESS as `0x${string}`,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [PAYOUT_SPLIT_ADDRESS as `0x${string}`, feeAmount],
      }),
      chainId: base.id,
    });
    refetchBalance();
    return txHash;
  }, [feeRequired, address, sendTransactionAsync, feeAmount, refetchBalance]);

  return { balance, hasEnough, feeRequired, feeAmount, payFee, refetchBalance };
}
