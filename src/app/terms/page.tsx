'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TermsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 px-4 py-8 pt-16">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.push('/')}>
            ← Back
          </Button>
          <h1 className="text-3xl font-bold text-purple-400">Terms of Service</h1>
        </div>

        <Card className="bg-black/80 border-purple-500/50">
          <CardHeader>
            <CardTitle className="text-xl text-purple-400">Shootris Terms of Service</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-300 text-sm">
            <p className="text-gray-500 italic">Last Updated: November 2025</p>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">1. Acceptance of Terms</h3>
              <p>
                By connecting your wallet to Shootris and using the application, you agree to be bound by these Terms of Service.
                If you do not agree to these terms, do not use the application.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">2. Wallet Connection</h3>
              <p>
                Shootris requires a Base-compatible smart wallet to play. By connecting your wallet, you authorize the application
                to read your wallet address and request transaction signatures for game-related payments.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">3. Payment Terms</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>The continue feature costs a fixed amount of $MYU tokens per use</li>
                <li>Payments are processed on the Base blockchain</li>
                <li><span className="text-yellow-400 font-bold">All purchases are final and non-refundable</span></li>
                <li>You are responsible for all blockchain transaction fees (gas)</li>
                <li>Payments are sent to the configured payout address</li>
                <li>In-app token swaps are executed by third-party decentralized exchanges at market prices; Shootris is not a party to, and does not set prices for, any swap</li>
                <li>$MYU is a utility token used within the game; it is not an investment, and nothing in this app constitutes financial advice</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">4. Game Rules</h3>
              <p>
                Shootris is an inverted Tetris game where pieces rise from the bottom. The application uses SpacetimeDB to
                store game state, scores, and match data. By playing, you consent to your game data being stored.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">5. PVP Modes</h3>
              <p>
                PVP modes (Floor Hit Duel and Time-Trial) are competitive multiplayer features. Match results are final once
                determined by the game logic. Disputes cannot be resolved retroactively.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">6. Data Storage</h3>
              <p>
                Game data including wallet addresses, scores, match history, and payment records are stored in SpacetimeDB.
                This data is used solely for game functionality and leaderboards.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">7. User Conduct</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>Do not exploit bugs or glitches</li>
                <li>Do not use automated tools or bots</li>
                <li>Do not attempt to manipulate game state or leaderboards</li>
                <li>Violations may result in wallet blacklisting</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">8. Disclaimer of Warranties</h3>
              <p>
                Shootris is provided "as is" without any warranties. We do not guarantee uninterrupted service, bug-free operation,
                or that the application will meet your expectations.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">9. Limitation of Liability</h3>
              <p>
                The developers of Shootris are not liable for any losses, damages, or issues arising from the use of this application,
                including but not limited to: lost funds, failed transactions, game state corruption, or data loss.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">10. Blockchain Risks</h3>
              <p>
                You acknowledge the inherent risks of blockchain transactions, including but not limited to: irreversible transactions,
                smart contract vulnerabilities, network congestion, and fluctuating gas fees.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">11. Changes to Terms</h3>
              <p>
                We reserve the right to modify these terms at any time. Continued use of the application after changes constitutes
                acceptance of the modified terms.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-white text-base">12. Contact</h3>
              <p>
                For questions about these terms, please reach out through the Farcaster community or Base network channels.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-700">
              <p className="text-xs text-gray-500 italic">
                By connecting your wallet and using Shootris, you acknowledge that you have read, understood, and agree to these
                Terms of Service.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
