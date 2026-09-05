# ShootrisSeasons — staged, NOT deployed

On-chain season settlement for Shootris, held in reserve. Day-to-day
gameplay, anti-cheat, and the leaderboard live in SpacetimeDB; this
contract only matters if you ever want season results (or prizes)
settled on Base.

Two modes:

- **Attestation only** (`postSeason` with `merkleRoot = 0`): permanently
  records a hash of the season's final results. No tokens move. No tax
  consequences.
- **Prize season** (`postSeason` with a merkle root + `totalPrize`):
  escrows MYU; winners pull their own claims with merkle proofs before
  the deadline; you sweep leftovers after. **Funding prizes distributes
  MYU** — the thing you've been avoiding — so treat this mode as opt-in
  with eyes open (talk to a tax professional first).

## Deploying (when/if needed)

1. Install Foundry (from git bash):

   ```bash
   curl -L https://foundry.paradigm.xyz | bash && foundryup
   ```

2. From `contracts/`, install the script dependency and build:

   ```bash
   forge install foundry-rs/forge-std
   forge build
   ```

3. Dry-run on Base Sepolia first, then deploy to Base mainnet:

   ```bash
   MYU_ADDRESS=0x240a0ce7f5495426ac2ac4242a0a24bb27812b07 \
   forge script script/Deploy.s.sol --rpc-url base --interactive --broadcast
   ```

   `--interactive` prompts for the deployer private key instead of
   putting it in your shell history or an env file. Never commit a
   private key.

4. Verify on Basescan (optional):

   ```bash
   forge verify-contract <DEPLOYED_ADDRESS> src/ShootrisSeasons.sol:ShootrisSeasons \
     --chain base --constructor-args $(cast abi-encode "constructor(address)" 0x240a0ce7f5495426ac2ac4242a0a24bb27812b07)
   ```

## Posting a season

Build the results document off-chain (the SpacetimeDB leaderboard export),
hash it, and call `postSeason(seasonId, keccak256(results), 0, 0, 0)` for a
free attestation. Prize seasons additionally need a merkle tree of
`keccak256(abi.encodePacked(player, amount))` leaves (sorted-pair hashing)
and an MYU approval for `totalPrize` before the call.
