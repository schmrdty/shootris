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

export const metadata: Metadata = {
        title: "Shootris Inverted Tetris",
        description: "Experience an exciting twist on Tetris where blocks rise! Engage in solo play or PVP duels in a seamless, cross-platform mini-app. Spend $MYU to continue your run. Join now and defy gravity!",
        other: { "fc:frame": JSON.stringify({
          "version": "next",
          "imageUrl": "https://bafybeigkkszqugfhb7v3znd2cib4xcxu7e6funfi2xx3ntjup3v24ybv2e.ipfs.dweb.link/shootris.png",
          "button": {
            "title": "Play Shootris",
            "action": {
              "type": "launch_frame",
              "name": "Shootris Inverted Tetris",
              "url": "https://shootris.schmidtiest.xyz",
              "splashImageUrl": "https://usdozf7pplhxfvrl.public.blob.vercel-storage.com/farcaster/splash_images/splash_image1.svg",
              "splashBackgroundColor": "#ffffff"
            }
          }
        }
        ) }
    };
