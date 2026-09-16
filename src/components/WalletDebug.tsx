'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAccount } from 'wagmi';
import { sdk } from '@farcaster/miniapp-sdk';
import { getWalletLog, subscribeWalletLog } from '@/lib/walletLog';

const emptyLog: ReturnType<typeof getWalletLog> = [];

/**
 * Diagnostics overlay, shown only with ?debug=1 in the URL. Reports what the
 * wallet is doing right now and the trail of events that led there, so a
 * drop that only happens inside a mini app can be captured on the device.
 */
export function WalletDebug() {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(true);
  const [miniApp, setMiniApp] = useState<string>('checking…');
  const { address, status, connector, chainId } = useAccount();
  const log = useSyncExternalStore(
    subscribeWalletLog,
    getWalletLog,
    () => emptyLog
  );

  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).has('debug'));
    sdk
      .isInMiniApp()
      .then((v) => setMiniApp(String(v)))
      .catch((e) => setMiniApp(`error: ${e instanceof Error ? e.message : e}`));
  }, []);

  if (!on) return null;

  return (
    <div className="fixed left-2 right-2 top-2 z-[60] rounded-lg border border-cyan-500/60 bg-black/95 p-2 font-mono text-[10px] text-cyan-200 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="font-bold text-cyan-400">wallet debug</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded border border-cyan-500/60 px-2">
          {open ? 'hide' : 'show'}
        </button>
      </div>
      {open && (
        <>
          <p>
            status={status} addr={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'none'} chain={chainId ?? '—'}
          </p>
          <p>
            connector={connector?.id ?? 'none'}/{connector?.type ?? '—'} miniApp={miniApp}
          </p>
          <div className="mt-1 max-h-40 overflow-y-auto border-t border-cyan-900 pt-1">
            {log.length === 0 && <p className="text-gray-500">no events yet</p>}
            {log
              .slice()
              .reverse()
              .map((e, i) => (
                <p key={`${e.at}-${i}`} className="whitespace-pre-wrap break-all">
                  {new Date(e.at).toLocaleTimeString()} {e.event}
                  {e.detail ? ` — ${e.detail}` : ''}
                </p>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
