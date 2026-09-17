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

// Cast embed card: 3:2 preview image + launch button. fc:miniapp is the
// current tag; fc:frame is kept for older clients (same card, legacy action).
const embed = (actionType: 'launch_miniapp' | 'launch_frame') =>
  JSON.stringify({
    version: '1',
    imageUrl: `${SITE}/brand/preview.png`,
    button: {
      title: 'Play Shootris',
      action: {
        type: actionType,
        name: 'Shootris',
        url: SITE,
        splashImageUrl: `${SITE}/brand/splash.png`,
        splashBackgroundColor: '#0a0e27',
      },
    },
  });

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Shootris',
  description:
    'Blocks rise instead of falling. Shoot them into place, clear lines, and climb the leaderboard in solo play or PVP duels. Spend $MYU to continue your run.',
  openGraph: {
    title: 'Shootris',
    description: 'Blocks rise instead of fall. Solo journey, PvP duels, and $MYU continues.',
    images: [{ url: '/brand/share.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', images: ['/brand/share.png'] },
  other: {
    'fc:miniapp': embed('launch_miniapp'),
    'fc:frame': embed('launch_frame'),
  },
};
