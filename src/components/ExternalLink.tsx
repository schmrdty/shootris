'use client';

import type { ReactNode } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Opens an outside URL. Inside a Farcaster / Base App mini app, plain
 * target=_blank links can be swallowed by the host webview, so hand the URL
 * to the host instead; on the web it is an ordinary new-tab link.
 */
export function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    const inMiniApp = await sdk.isInMiniApp().catch(() => false);
    if (!inMiniApp) return; // let the browser follow the link
    e.preventDefault();
    await sdk.actions.openUrl(href);
  };

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
