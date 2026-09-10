import type { Metadata } from 'next';
import '@coinbase/onchainkit/styles.css';
import './globals.css';
import { Providers } from './providers';
import FarcasterWrapper from "@/components/FarcasterWrapper";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
        <html lang="en">
          <body>
            <Providers>
      <FarcasterWrapper>
        {children}
      </FarcasterWrapper>
      </Providers>
          </body>
        </html>
      );
}

const SITE = `https://${process.env.NEXT_PUBLIC_HOST || 'shootris.schmidtiest.xyz'}`;

export const metadata: Metadata = {
        metadataBase: new URL(SITE),
        openGraph: {
          title: "Shootris — Inverted Tetris",
          description: "Blocks rise instead of fall. Solo journey, PvP duels, and $MYU continues.",
          images: ["/brand/og.png"],
        },
        twitter: { card: "summary_large_image", images: ["/brand/og.png"] },
        title: "Shootris Inverted Tetris",
        description: "Experience an exciting twist on Tetris where blocks rise! Engage in solo play or PVP duels in a seamless, cross-platform mini-app. Spend $MYU to continue your run. Join now and defy gravity!",
        other: { "fc:frame": JSON.stringify({
          "version": "next",
          "imageUrl": `${SITE}/brand/og.png`,
          "button": {
            "title": "Play Shootris",
            "action": {
              "type": "launch_frame",
              "name": "Shootris Inverted Tetris",
              "url": SITE,
              "splashImageUrl": `${SITE}/brand/splash.png`,
              "splashBackgroundColor": "#0a0e27"
            }
          }
        }
        ) }
    };
