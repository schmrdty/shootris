// SpacetimeDB imports must be at the top.
use spacetimedb::{table, reducer, ReducerContext, Identity, ScheduleAt, Table, TimeDuration, Timestamp, SpacetimeType};

use std::cmp::Ordering;
use std::collections::HashMap;

// =========================
// Shared Types
// =========================

#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub enum MatchType {
    FloorHitDuel,
    ScoreRaceTimeTrial,
}

#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub enum MatchStatus {
    Waiting,
    Active,
    Completed,
    Cancelled,
}

// =========================
// Constants
// =========================

const TIME_TRIAL_DEFAULT_SECONDS: i64 = 180;

// A match nobody joins, or one whose player walks away, must not sit open
// forever: the invite expires and an abandoned match is decided.
const MATCH_TIMEOUT_MICROS: i64 = 5 * 60 * 1_000_000;
const SWEEP_INTERVAL_MICROS: i64 = 30 * 1_000_000;
// Invite-code matches are sent to a friend who may play later, so they stay
// open for a day. Quick Match only ever joins public waiting matches, which
// keep the five-minute limit so nobody is paired with a creator long gone.
const INVITE_TIMEOUT_MICROS: i64 = 24 * 60 * 60 * 1_000_000;

// When a match ends, a participant whose last board update is older than
// this has left. Clients send one every second while they are on the page.
const PRESENCE_WINDOW_MICROS: i64 = 30 * 1_000_000;

// A single-player run nobody has touched in a day is over: the player walked
// away without quitting. The run sweeper closes such runs once an hour.
const STALE_RUN_MICROS: i64 = 24 * 60 * 60 * 1_000_000;
const RUN_SWEEP_INTERVAL_MICROS: i64 = 60 * 60 * 1_000_000;

// PvE progression constants — must mirror src/lib/tetris/types.ts
const LINES_PER_LEVEL_SRV: u32 = 10;
const LEVELS_PER_STAGE_SRV: u64 = 10;
const STAGE_BONUS: u64 = 5000;
// Max humanly plausible clear rate, with a small grace allowance
const MAX_LINES_PER_SEC: i64 = 2;

// The database OWNER's identity — the account that publishes this module.
// This is the root of trust and its token should never leave a trusted
// machine, because that same token can republish or delete the database.
const OWNER_IDENTITY_HEX: &str = "c200e8bb42d1cb9144065511ee5e187567e0adc48f32f84bd551bfa0d3dc0531";

// =========================
/**
 * Tables
 */
// =========================

// Players: wallet address as primary key
#[table(name = players, public)]
#[derive(Clone)]
pub struct Player {
    #[primary_key]
    wallet: String,
    // All three are recounted from game_runs and pvp_matches, never bumped
    // in place (see refresh_player_row). Single-player runs are scored by
    // lines, so wins and losses exist only in PvP.
    total_games: u64, // Finished single-player runs + completed PvP matches
    total_wins: u64,  // PvP wins
    pvp_wins: u64,    // PvP wins (per-mode detail in pvp_leaderboard)
    music_on: bool,
    created_at: Timestamp,
    updated_at: Timestamp,
}

// Single-player game runs
#[table(
    name = game_runs,
    public,
    index(name = runs_by_wallet_active, btree(columns = [wallet, active])),
    index(name = runs_by_wallet, btree(columns = [wallet]))
)]
#[derive(Clone)]
pub struct GameRun {
    #[primary_key]
    #[auto_inc]
    run_id: u64,
    wallet: String,
    score: u64,
    lines_cleared: u32,
    level_reached: u32,
    active: bool,
    board_state: String,
    created_at: Timestamp,
    updated_at: Timestamp,
}

// Payment records for continues
#[table(
    name = payment_records,
    public,
    index(name = payments_by_wallet, btree(columns = [wallet])),
    index(name = payments_by_run, btree(columns = [run_id]))
)]
#[derive(Clone)]
pub struct PaymentRecord {
    #[primary_key]
    #[auto_inc]
    payment_id: u64,
    wallet: String,
    run_id: u64,
    amount_cents: i64,
    tx_hash: String,
    timestamp: Timestamp,
}

// Matchmaking queue (auto-match)
#[table(
    name = match_queue,
    public,
    index(name = queue_by_match_type, btree(columns = [match_type])),
    index(name = queue_by_wallet, btree(columns = [wallet]))
)]
#[derive(Clone)]
pub struct MatchQueue {
    #[primary_key]
    #[auto_inc]
    queue_id: u64,
    wallet: String,
    match_type: MatchType,
    // i64 microseconds since epoch
    created_at: i64,
}

// PVP matches (enhanced)
#[table(
    name = pvp_matches,
    public,
    index(name = matches_by_status, btree(columns = [status])),
    index(name = matches_by_player1, btree(columns = [player1_wallet])),
    index(name = matches_by_player2, btree(columns = [player2_wallet])),
    index(name = matches_by_join_code, btree(columns = [join_code]))
)]
#[derive(Clone)]
pub struct PvpMatch {
    #[primary_key]
    #[auto_inc]
    match_id: u64,
    match_type: MatchType,
    player1_wallet: String,
    player2_wallet: Option<String>,
    status: MatchStatus,
    // Optional invite/join code for invite-based matchmaking
    join_code: Option<String>,
    // BigInt-equivalent scores
    player1_score: i128,
    player2_score: i128,
    // Optional board states (useful for spectators/clients)
    player1_board_state: String,
    player2_board_state: String,
    // Score race duration (seconds). 0 for FloorHitDuel
    match_duration_seconds: i64,
    // Winner wallet if completed
    winner_wallet: Option<String>,
    // Timestamps
    created_at: Timestamp,
    started_at: Option<Timestamp>,
    completed_at: Option<Timestamp>,
    // Convenience timestamp
    updated_at: Timestamp,
}

// Single-player leaderboard snapshot (by best score)
#[table(name = sp_leaderboard, public)]
#[derive(Clone)]
pub struct SpLeaderboardEntry {
    #[primary_key]
    #[auto_inc]
    id: u64,
    rank: u32,
    wallet: String,
    best_score: u64,
    total_runs: u64,
    best_lines: u32,
    best_level: u32,
}

// PvP leaderboard (per-wallet stats)
#[table(name = pvp_leaderboard, public)]
#[derive(Clone)]
pub struct PvpLeaderboard {
    #[primary_key]
    wallet: String,
    floor_duel_wins: u64,
    floor_duel_played: u64,
    score_race_wins: u64,
    score_race_played: u64,
    total_pvp_wins: u64,
    total_pvp_played: u64,
    updated_at: Timestamp,
}

// Least-privilege identity used by the public app server. It may ONLY
// attest wallet bindings — it cannot publish, delete, or act on behalf of
// players. Set with set_attestor (owner only) so it can be rotated without
// republishing the module.
#[table(name = app_config, public)]
#[derive(Clone)]
pub struct AppConfig {
    #[primary_key]
    id: u8, // always 0 — single row
    attestor: Identity,
    updated_at: Timestamp,
}

// Wallet <-> SpacetimeDB identity bindings, attested by the app server.
// A caller may only mutate data for wallets whose binding matches ctx.sender.
#[table(name = wallet_bindings, public)]
#[derive(Clone)]
pub struct WalletBinding {
    #[primary_key]
    wallet: String,
    identity: Identity,
    bound_at: Timestamp,
}

// Last time each participant sent a board update. Kept out of PvpMatch so
// the sweeper can tell WHICH player went quiet, not just that the row was
// touched — and so this works as an additive schema change.
#[table(name = pvp_activity, public, index(name = activity_by_match, btree(columns = [match_id])))]
#[derive(Clone)]
pub struct PvpActivity {
    #[primary_key]
    key: String, // "<match_id>:<wallet>"
    match_id: u64,
    wallet: String,
    last_seen: Timestamp,
}

// Drives sweep_matches on a repeating schedule.
#[table(name = match_sweeper_schedule, scheduled(sweep_matches))]
pub struct MatchSweeperSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
}

// Drives sweep_runs on a repeating schedule.
#[table(name = run_sweeper_schedule, scheduled(sweep_runs))]
pub struct RunSweeperSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
}

// =========================
/**
 * Helpers
 */
// =========================

fn owner_identity() -> Identity {
    Identity::from_hex(OWNER_IDENTITY_HEX).expect("OWNER_IDENTITY_HEX must be valid hex")
}

/// The currently configured attestor, if one has been set.
fn attestor_identity(ctx: &ReducerContext) -> Option<Identity> {
    ctx.db.app_config().id().find(&0u8).map(|c| c.attestor)
}

/// May this caller attest wallet bindings? Owner (root of trust) or the
/// configured attestor (the token that lives on the public app server).
fn can_attest(ctx: &ReducerContext) -> bool {
    ctx.sender == owner_identity()
        || attestor_identity(ctx).map(|a| a == ctx.sender).unwrap_or(false)
}

// The caller's identity must be bound to `wallet` (or be the app server).
fn require_bound(ctx: &ReducerContext, wallet: &str) -> Result<(), String> {
    // Deliberately owner-only: the attestor may create bindings but must not
    // be able to submit gameplay data as somebody else.
    if ctx.sender == owner_identity() {
        return Ok(());
    }
    match ctx.db.wallet_bindings().wallet().find(&wallet.to_string()) {
        Some(b) if b.identity == ctx.sender => Ok(()),
        Some(_) => Err("Caller identity is not bound to this wallet".into()),
        None => Err("Wallet not verified — complete wallet verification first".into()),
    }
}

// Upper bound on a legitimate single-player score for a given line count,
// mirroring the client engine's scoring formula.
fn max_plausible_score(lines: u32) -> u64 {
    let max_level = (lines / LINES_PER_LEVEL_SRV + 1) as u64;
    let stages_cleared = max_level.saturating_sub(1) / LEVELS_PER_STAGE_SRV;
    let stage_bonus_total = STAGE_BONUS * stages_cleared * (stages_cleared + 1) / 2;
    (lines as u64) * 100 * max_level + stage_bonus_total
}

fn ensure_player_exists(ctx: &ReducerContext, wallet: &str) {
    if ctx.db.players().wallet().find(&wallet.to_string()).is_none() {
        let ts = ctx.timestamp;
        let new_player = Player {
            wallet: wallet.to_string(),
            total_games: 0,
            total_wins: 0,
            pvp_wins: 0,
            music_on: true,
            created_at: ts,
            updated_at: ts,
        };
        ctx.db.players().insert(new_player);
    }
}

/// A run that never recorded anything: no score, no lines, no piece on the
/// board, no continue bought. This is what a duplicate start leaves behind,
/// or a game abandoned before it reported. It is deleted rather than counted.
fn is_void_run(ctx: &ReducerContext, run: &GameRun) -> bool {
    // Placed pieces are stored as colour strings; an empty board is all nulls
    run.score == 0
        && run.lines_cleared == 0
        && !run.board_state.contains('"')
        && ctx.db.payment_records().payments_by_run().filter(run.run_id).next().is_none()
}

/// Close a run: delete it if it is void, otherwise mark it finished.
fn close_run(ctx: &ReducerContext, mut run: GameRun) {
    if is_void_run(ctx, &run) {
        ctx.db.game_runs().run_id().delete(&run.run_id);
    } else {
        run.active = false;
        run.updated_at = ctx.timestamp;
        ctx.db.game_runs().run_id().update(run);
    }
}

/// Recount a wallet's per-mode PvP record from its completed matches.
fn refresh_pvp_stats(ctx: &ReducerContext, wallet: &str) {
    let (mut fd_played, mut fd_wins, mut sr_played, mut sr_wins) = (0u64, 0u64, 0u64, 0u64);
    for m in ctx.db.pvp_matches().iter() {
        if m.status != MatchStatus::Completed {
            continue;
        }
        let in_match = m.player1_wallet == wallet || m.player2_wallet.as_deref() == Some(wallet);
        if !in_match {
            continue;
        }
        let won = m.winner_wallet.as_deref() == Some(wallet);
        match m.match_type {
            MatchType::FloorHitDuel => {
                fd_played += 1;
                fd_wins += won as u64;
            }
            MatchType::ScoreRaceTimeTrial => {
                sr_played += 1;
                sr_wins += won as u64;
            }
        }
    }

    let row = PvpLeaderboard {
        wallet: wallet.to_string(),
        floor_duel_wins: fd_wins,
        floor_duel_played: fd_played,
        score_race_wins: sr_wins,
        score_race_played: sr_played,
        total_pvp_wins: fd_wins + sr_wins,
        total_pvp_played: fd_played + sr_played,
        updated_at: ctx.timestamp,
    };
    match ctx.db.pvp_leaderboard().wallet().find(&wallet.to_string()) {
        Some(old) => {
            let unchanged = old.floor_duel_wins == row.floor_duel_wins
                && old.floor_duel_played == row.floor_duel_played
                && old.score_race_wins == row.score_race_wins
                && old.score_race_played == row.score_race_played
                && old.total_pvp_wins == row.total_pvp_wins
                && old.total_pvp_played == row.total_pvp_played;
            if !unchanged {
                ctx.db.pvp_leaderboard().wallet().update(row);
            }
        }
        None if row.total_pvp_played > 0 => {
            ctx.db.pvp_leaderboard().insert(row);
        }
        None => {}
    }
}

/// Recount the players row from finished runs and the PvP record. Derived,
/// not incremented, so a repeated or retried call can never count a game
/// twice. Call refresh_pvp_stats first when a match result changed.
fn refresh_player_row(ctx: &ReducerContext, wallet: &str) {
    let Some(mut player) = ctx.db.players().wallet().find(&wallet.to_string()) else {
        return;
    };
    let solo_finished = ctx
        .db
        .game_runs()
        .runs_by_wallet()
        .filter(wallet)
        .filter(|r| !r.active)
        .count() as u64;
    let (pvp_played, pvp_wins) = ctx
        .db
        .pvp_leaderboard()
        .wallet()
        .find(&wallet.to_string())
        .map(|p| (p.total_pvp_played, p.total_pvp_wins))
        .unwrap_or((0, 0));

    let total_games = solo_finished + pvp_played;
    if player.total_games == total_games && player.total_wins == pvp_wins && player.pvp_wins == pvp_wins {
        return;
    }
    player.total_games = total_games;
    player.total_wins = pvp_wins;
    player.pvp_wins = pvp_wins;
    player.updated_at = ctx.timestamp;
    ctx.db.players().wallet().update(player);
}

fn refresh_player_stats(ctx: &ReducerContext, wallet: &str) {
    refresh_pvp_stats(ctx, wallet);
    refresh_player_row(ctx, wallet);
}

fn activity_key(match_id: u64, wallet: &str) -> String {
    format!("{}:{}", match_id, wallet)
}

fn touch_activity(ctx: &ReducerContext, match_id: u64, wallet: &str) {
    let key = activity_key(match_id, wallet);
    let row = PvpActivity {
        key: key.clone(),
        match_id,
        wallet: wallet.to_string(),
        last_seen: ctx.timestamp,
    };
    if ctx.db.pvp_activity().key().find(&key).is_some() {
        ctx.db.pvp_activity().key().update(row);
    } else {
        ctx.db.pvp_activity().insert(row);
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Presence {
    /// Never sent a single board update for this match
    NeverShowed,
    /// Sent updates, but none within the window
    Gone,
    Present,
}

fn presence(ctx: &ReducerContext, match_id: u64, wallet: Option<&str>, window_micros: i64) -> Presence {
    let Some(wallet) = wallet else {
        return Presence::NeverShowed;
    };
    match ctx.db.pvp_activity().key().find(&activity_key(match_id, wallet)) {
        None => Presence::NeverShowed,
        Some(a) if ctx.timestamp.to_micros_since_unix_epoch() - a.last_seen.to_micros_since_unix_epoch() > window_micros => {
            Presence::Gone
        }
        Some(_) => Presence::Present,
    }
}

enum Verdict {
    /// Nobody is credited: the match is cancelled
    Void,
    /// This participant wins regardless of the board
    Win(String),
    /// Both are here: decide by the game itself
    Play,
}

/// How a match ends when one or both players are missing:
/// - a player never showed up -> the match never really started: void
/// - both players left -> void
/// - one left, one is still here -> the one still here wins
fn verdict_by_presence(m: &PvpMatch, p1: Presence, p2: Presence) -> Verdict {
    use Presence::*;
    match (p1, p2) {
        (NeverShowed, _) | (_, NeverShowed) | (Gone, Gone) => Verdict::Void,
        (Present, Gone) => Verdict::Win(m.player1_wallet.clone()),
        (Gone, Present) => match m.player2_wallet.clone() {
            Some(p2) => Verdict::Win(p2),
            None => Verdict::Void,
        },
        (Present, Present) => Verdict::Play,
    }
}

/// Cancel a match without crediting anyone.
fn void_match(ctx: &ReducerContext, mut m: PvpMatch) {
    m.status = MatchStatus::Cancelled;
    m.updated_at = ctx.timestamp;
    ctx.db.pvp_matches().match_id().update(m);
}

/// Record the result of a match, then recount both players' records.
fn finalize_match(ctx: &ReducerContext, mut m: PvpMatch, winner_wallet: String) {
    let p1 = m.player1_wallet.clone();
    let p2 = m.player2_wallet.clone();

    m.status = MatchStatus::Completed;
    m.winner_wallet = Some(winner_wallet);
    m.completed_at = Some(ctx.timestamp);
    if m.started_at.is_none() {
        m.started_at = Some(ctx.timestamp);
    }
    m.updated_at = ctx.timestamp;
    ctx.db.pvp_matches().match_id().update(m);

    refresh_player_stats(ctx, &p1);
    if let Some(p2) = p2 {
        refresh_player_stats(ctx, &p2);
    }
}

fn default_duration_for(match_type: &MatchType) -> i64 {
    match match_type {
        MatchType::FloorHitDuel => 0,
        MatchType::ScoreRaceTimeTrial => TIME_TRIAL_DEFAULT_SECONDS,
    }
}

// =========================
// Reducers: Wallet binding (app-server attested)
// =========================

/// Point the module at the app server's least-privilege identity.
/// Owner only. Call it again at any time to rotate the attestor — for
/// example if the public server is rebuilt or believed compromised:
///   spacetime call shootris-game set_attestor '"<identity-hex>"'
#[reducer]
pub fn set_attestor(ctx: &ReducerContext, identity_hex: String) -> Result<(), String> {
    if ctx.sender != owner_identity() {
        return Err("Only the database owner may set the attestor".into());
    }
    let identity = Identity::from_hex(identity_hex.trim())
        .map_err(|e| format!("Invalid identity hex: {e}"))?;
    if let Some(mut c) = ctx.db.app_config().id().find(&0u8) {
        c.attestor = identity;
        c.updated_at = ctx.timestamp;
        ctx.db.app_config().id().update(c);
    } else {
        ctx.db.app_config().insert(AppConfig {
            id: 0,
            attestor: identity,
            updated_at: ctx.timestamp,
        });
    }
    Ok(())
}

#[reducer]
pub fn admin_bind_wallet(ctx: &ReducerContext, wallet: String, identity_hex: String) -> Result<(), String> {
    if !can_attest(ctx) {
        return Err("Only the owner or the configured attestor may bind wallets".into());
    }
    let wallet = wallet.trim().to_lowercase();
    if wallet.is_empty() {
        return Err("Wallet cannot be empty".into());
    }
    let identity = Identity::from_hex(identity_hex.trim())
        .map_err(|e| format!("Invalid identity hex: {e}"))?;
    ensure_player_exists(ctx, &wallet);
    if let Some(mut b) = ctx.db.wallet_bindings().wallet().find(&wallet) {
        // Re-binding with a fresh verified signature is allowed (new device/browser)
        b.identity = identity;
        b.bound_at = ctx.timestamp;
        ctx.db.wallet_bindings().wallet().update(b);
    } else {
        ctx.db.wallet_bindings().insert(WalletBinding {
            wallet,
            identity,
            bound_at: ctx.timestamp,
        });
    }
    Ok(())
}

// =========================
// Reducers: Player management
// =========================

#[reducer]
pub fn register_player(ctx: &ReducerContext, wallet: String) -> Result<(), String> {
    if wallet.trim().is_empty() {
        return Err("Wallet cannot be empty".into());
    }
    if ctx.db.players().wallet().find(&wallet).is_some() {
        return Ok(());
    }
    let ts = ctx.timestamp;
    let player = Player {
        wallet: wallet.clone(),
        total_games: 0,
        total_wins: 0,
        pvp_wins: 0,
        music_on: true,
        created_at: ts,
        updated_at: ts,
    };
    ctx.db.players().insert(player);
    Ok(())
}

#[reducer]
pub fn set_player_music(ctx: &ReducerContext, wallet: String, music_on: bool) -> Result<(), String> {
    require_bound(ctx, &wallet)?;
    ensure_player_exists(ctx, &wallet);
    if let Some(mut player) = ctx.db.players().wallet().find(&wallet) {
        player.music_on = music_on;
        player.updated_at = ctx.timestamp;
        ctx.db.players().wallet().update(player);
        Ok(())
    } else {
        Err("Failed to update music setting".into())
    }
}

// =========================
// Reducers: Single-player runs
// =========================

#[reducer]
pub fn start_single_run(ctx: &ReducerContext, wallet: String, initial_board: String, level: u32) -> Result<(), String> {
    if wallet.trim().is_empty() {
        return Err("Wallet cannot be empty".into());
    }
    require_bound(ctx, &wallet)?;
    ensure_player_exists(ctx, &wallet);

    // Close the wallet's open runs. One that recorded nothing is deleted, so
    // a start sent twice in a row leaves one run behind, not two.
    let open: Vec<GameRun> = ctx
        .db
        .game_runs()
        .runs_by_wallet()
        .filter(&wallet)
        .filter(|r| r.active)
        .collect();
    for run in open {
        close_run(ctx, run);
    }

    let ts = ctx.timestamp;
    let run = GameRun {
        run_id: 0,
        wallet: wallet.clone(),
        score: 0,
        lines_cleared: 0,
        level_reached: level,
        active: true,
        board_state: initial_board,
        created_at: ts,
        updated_at: ts,
    };
    ctx.db.game_runs().insert(run);

    // A game counts when it finishes, not when it starts
    refresh_player_row(ctx, &wallet);

    Ok(())
}

#[reducer]
pub fn update_single_run(
    ctx: &ReducerContext,
    run_id: u64,
    score: u64,
    lines_cleared: u32,
    level_reached: u32,
    board_state: String,
    active: bool,
    won: bool,
) -> Result<(), String> {
    // Kept for client compatibility. Single-player runs have no wins.
    let _ = won;
    if let Some(mut run) = ctx.db.game_runs().run_id().find(&run_id) {
        require_bound(ctx, &run.wallet)?;

        // Server-side plausibility checks
        if score < run.score || lines_cleared < run.lines_cleared {
            return Err("Score and lines cannot decrease within a run".into());
        }
        let expected_level = lines_cleared / LINES_PER_LEVEL_SRV + 1;
        if level_reached != expected_level {
            return Err("Level inconsistent with lines cleared".into());
        }
        let elapsed_secs = (ctx.timestamp.to_micros_since_unix_epoch()
            - run.created_at.to_micros_since_unix_epoch())
            / 1_000_000;
        if (lines_cleared as i64) > elapsed_secs.max(1) * MAX_LINES_PER_SEC + 4 {
            return Err("Implausible line clear rate".into());
        }
        if score > max_plausible_score(lines_cleared) {
            return Err("Implausible score for lines cleared".into());
        }

        let wallet_clone = run.wallet.clone();
        let was_active = run.active;

        run.score = score;
        run.lines_cleared = lines_cleared;
        run.level_reached = level_reached;
        run.board_state = board_state;
        run.active = active;
        run.updated_at = ctx.timestamp;

        ctx.db.game_runs().run_id().update(run);

        // Finishing (or reviving) a run changes the finished-games count
        if was_active != active {
            refresh_player_row(ctx, &wallet_clone);
        }

        Ok(())
    } else {
        Err("Run not found".into())
    }
}

// =========================
// Reducers: Payments
// =========================

#[reducer]
pub fn record_continue_payment(
    ctx: &ReducerContext,
    wallet: String,
    run_id: u64,
    amount_cents: i64,
    tx_hash: String,
) -> Result<(), String> {
    if wallet.trim().is_empty() {
        return Err("Wallet cannot be empty".into());
    }
    require_bound(ctx, &wallet)?;
    if amount_cents <= 0 {
        return Err("Amount must be positive".into());
    }
    // Optionally validate run exists
    if ctx.db.game_runs().run_id().find(&run_id).is_none() {
        return Err("Associated run not found".into());
    }

    let payment = PaymentRecord {
        payment_id: 0,
        wallet: wallet.clone(),
        run_id,
        amount_cents,
        tx_hash,
        timestamp: ctx.timestamp,
    };
    ctx.db.payment_records().insert(payment);

    Ok(())
}

// =========================
/**
 * Reducers: PVP matches
 */
// =========================

#[reducer]
pub fn create_pvp_match(ctx: &ReducerContext, wallet: String, match_type: MatchType) -> Result<(), String> {
    if wallet.trim().is_empty() {
        return Err("Wallet cannot be empty".into());
    }
    require_bound(ctx, &wallet)?;
    ensure_player_exists(ctx, &wallet);

    let ts = ctx.timestamp;

    // Merged pools: quick match first joins the earliest public waiting match
    // (so two players both pressing Quick Match pair up instead of each
    // creating their own waiting match)
    let mut waiting: Option<PvpMatch> = None;
    for m in ctx.db.pvp_matches().iter() {
        if m.match_type == match_type
            && m.status == MatchStatus::Waiting
            && m.player2_wallet.is_none()
            && m.join_code.is_none()
            && m.player1_wallet != wallet
        {
            match &waiting {
                None => waiting = Some(m),
                Some(candidate) => {
                    if m.created_at.to_micros_since_unix_epoch()
                        < candidate.created_at.to_micros_since_unix_epoch()
                    {
                        waiting = Some(m);
                    }
                }
            }
        }
    }
    if let Some(mut m) = waiting {
        m.player2_wallet = Some(wallet);
        m.status = MatchStatus::Active;
        m.started_at = Some(ctx.timestamp);
        m.updated_at = ctx.timestamp;
        ctx.db.pvp_matches().match_id().update(m);
        return Ok(());
    }

    // Next, if someone is already waiting in the queue for this mode,
    // start an active match with them immediately instead of waiting
    let mut best_other: Option<MatchQueue> = None;
    for entry in ctx.db.match_queue().iter() {
        if entry.match_type == match_type && entry.wallet != wallet {
            match &best_other {
                None => best_other = Some(entry),
                Some(candidate) => {
                    if entry.created_at < candidate.created_at {
                        best_other = Some(entry);
                    }
                }
            }
        }
    }
    if let Some(other) = best_other {
        let m = PvpMatch {
            match_id: 0,
            match_type: match_type.clone(),
            player1_wallet: wallet.clone(),
            player2_wallet: Some(other.wallet.clone()),
            status: MatchStatus::Active,
            join_code: None,
            player1_score: 0,
            player2_score: 0,
            player1_board_state: String::new(),
            player2_board_state: String::new(),
            match_duration_seconds: default_duration_for(&match_type),
            winner_wallet: None,
            created_at: ts,
            started_at: Some(ts),
            completed_at: None,
            updated_at: ts,
        };
        ctx.db.pvp_matches().insert(m);
        ctx.db.match_queue().queue_id().delete(&other.queue_id);
        return Ok(());
    }

    let m = PvpMatch {
        match_id: 0,
        match_type: match_type.clone(),
        player1_wallet: wallet.clone(),
        player2_wallet: None,
        status: MatchStatus::Waiting,
        join_code: None,
        player1_score: 0,
        player2_score: 0,
        player1_board_state: String::new(),
        player2_board_state: String::new(),
        match_duration_seconds: default_duration_for(&match_type),
        winner_wallet: None,
        created_at: ts,
        started_at: None,
        completed_at: None,
        updated_at: ts,
    };
    ctx.db.pvp_matches().insert(m);

    Ok(())
}

#[reducer]
pub fn create_pvp_match_with_code(ctx: &ReducerContext, wallet: String, match_type: MatchType, join_code: String) -> Result<(), String> {
    let code = join_code.trim().to_string();
    if wallet.trim().is_empty() {
        return Err("Wallet cannot be empty".into());
    }
    if code.is_empty() {
        return Err("Join code cannot be empty".into());
    }
    require_bound(ctx, &wallet)?;
    ensure_player_exists(ctx, &wallet);

    // Ensure code is not already in use for a waiting match
    for m in ctx.db.pvp_matches().iter() {
        if m.join_code.as_ref().map(|c| c == &code).unwrap_or(false) && m.status == MatchStatus::Waiting {
            return Err("Join code already in use".into());
        }
    }

    let ts = ctx.timestamp;
    let m = PvpMatch {
        match_id: 0,
        match_type: match_type.clone(),
        player1_wallet: wallet.clone(),
        player2_wallet: None,
        status: MatchStatus::Waiting,
        join_code: Some(code),
        player1_score: 0,
        player2_score: 0,
        player1_board_state: String::new(),
        player2_board_state: String::new(),
        match_duration_seconds: default_duration_for(&match_type),
        winner_wallet: None,
        created_at: ts,
        started_at: None,
        completed_at: None,
        updated_at: ts,
    };
    ctx.db.pvp_matches().insert(m);
    Ok(())
}

#[reducer]
pub fn join_pvp_match(ctx: &ReducerContext, wallet: String, match_id: u64) -> Result<(), String> {
    if wallet.trim().is_empty() {
        return Err("Wallet cannot be empty".into());
    }
    require_bound(ctx, &wallet)?;
    if let Some(mut m) = ctx.db.pvp_matches().match_id().find(&match_id) {
        if m.status != MatchStatus::Waiting || m.player2_wallet.is_some() {
            return Err("Match is not joinable".into());
        }
        if m.player1_wallet == wallet {
            return Err("Cannot join your own match".into());
        }
        ensure_player_exists(ctx, &wallet);

        m.player2_wallet = Some(wallet);
        m.status = MatchStatus::Active;
        m.started_at = Some(ctx.timestamp);
        m.updated_at = ctx.timestamp;

        ctx.db.pvp_matches().match_id().update(m);
        Ok(())
    } else {
        Err("Match not found".into())
    }
}

#[reducer]
pub fn join_pvp_match_by_code(ctx: &ReducerContext, wallet: String, join_code: String) -> Result<(), String> {
    if wallet.trim().is_empty() {
        return Err("Wallet cannot be empty".into());
    }
    let code = join_code.trim().to_string();
    if code.is_empty() {
        return Err("Join code cannot be empty".into());
    }
    require_bound(ctx, &wallet)?;
    ensure_player_exists(ctx, &wallet);

    // Find a waiting match by code
    let mut target: Option<PvpMatch> = None;
    for m in ctx.db.pvp_matches().iter() {
        if m.join_code.as_ref().map(|c| c == &code).unwrap_or(false)
            && m.status == MatchStatus::Waiting
            && m.player2_wallet.is_none()
        {
            target = Some(m);
            break;
        }
    }

    if let Some(mut m) = target {
        if m.player1_wallet == wallet {
            return Err("Cannot join your own match".into());
        }
        m.player2_wallet = Some(wallet);
        m.status = MatchStatus::Active;
        m.started_at = Some(ctx.timestamp);
        m.updated_at = ctx.timestamp;
        ctx.db.pvp_matches().match_id().update(m);
        Ok(())
    } else {
        Err("No joinable match found for the provided code".into())
    }
}

#[reducer]
pub fn update_pvp_board(ctx: &ReducerContext, match_id: u64, wallet: String, board_state: String, score: i128) -> Result<(), String> {
    require_bound(ctx, &wallet)?;
    touch_activity(ctx, match_id, &wallet);
    if let Some(mut m) = ctx.db.pvp_matches().match_id().find(&match_id) {
        if m.status != MatchStatus::Active && m.status != MatchStatus::Waiting {
            return Err("Cannot update board for a completed or cancelled match".into());
        }

        // Plausibility: scores never decrease and are rate-bounded
        let started = m.started_at.unwrap_or(m.created_at);
        let elapsed_secs = ((ctx.timestamp.to_micros_since_unix_epoch()
            - started.to_micros_since_unix_epoch())
            / 1_000_000)
            .max(1);
        if score > (elapsed_secs as i128) * 2000 {
            return Err("Implausible PvP score rate".into());
        }

        if m.player1_wallet == wallet {
            if score < m.player1_score {
                return Err("PvP score cannot decrease".into());
            }
            m.player1_board_state = board_state;
            m.player1_score = score;
        } else if m.player2_wallet.as_ref().map(|w| w == &wallet).unwrap_or(false) {
            if score < m.player2_score {
                return Err("PvP score cannot decrease".into());
            }
            m.player2_board_state = board_state;
            m.player2_score = score;
        } else {
            return Err("Wallet is not a participant in this match".into());
        }
        m.updated_at = ctx.timestamp;
        ctx.db.pvp_matches().match_id().update(m);
        Ok(())
    } else {
        Err("Match not found".into())
    }
}

#[reducer]
pub fn complete_pvp_match(ctx: &ReducerContext, match_id: u64, winner_wallet: String) -> Result<(), String> {
    if let Some(m) = ctx.db.pvp_matches().match_id().find(&match_id) {
        if m.status == MatchStatus::Completed || m.status == MatchStatus::Cancelled {
            return Err("Match is already finalized".into());
        }

        // Caller must be a bound participant (or the app server)
        let sender_bound_to = |w: &String| {
            ctx.db
                .wallet_bindings()
                .wallet()
                .find(w)
                .map(|b| b.identity == ctx.sender)
                .unwrap_or(false)
        };
        let caller_is_participant = sender_bound_to(&m.player1_wallet)
            || m.player2_wallet.as_ref().map(&sender_bound_to).unwrap_or(false);
        if !caller_is_participant && ctx.sender != owner_identity() {
            return Err("Caller is not a participant in this match".into());
        }

        // A player who has left cannot win, and topping out against an
        // opponent who is no longer playing is not a loss. The caller sends
        // a board update just before this, so the caller reads as present.
        let p1 = presence(ctx, m.match_id, Some(&m.player1_wallet), PRESENCE_WINDOW_MICROS);
        let p2 = presence(ctx, m.match_id, m.player2_wallet.as_deref(), PRESENCE_WINDOW_MICROS);
        match verdict_by_presence(&m, p1, p2) {
            Verdict::Void => {
                void_match(ctx, m);
                return Ok(());
            }
            Verdict::Win(winner) => {
                finalize_match(ctx, m, winner);
                return Ok(());
            }
            Verdict::Play => {}
        }

        // Score races are decided by the server-recorded scores, not the caller
        let winner_wallet = if m.match_type == MatchType::ScoreRaceTimeTrial {
            if m.player2_score > m.player1_score {
                m.player2_wallet.clone().unwrap_or_else(|| m.player1_wallet.clone())
            } else {
                m.player1_wallet.clone()
            }
        } else {
            winner_wallet
        };

        // Validate winner is a participant
        let winner_is_p1 = m.player1_wallet == winner_wallet;
        let winner_is_p2 = m.player2_wallet.as_ref().map(|w| w == &winner_wallet).unwrap_or(false);
        if !winner_is_p1 && !winner_is_p2 {
            return Err("Winner must be a participant".into());
        }

        finalize_match(ctx, m, winner_wallet);
        Ok(())
    } else {
        Err("Match not found".into())
    }
}

/// Withdraw a waiting match. Only the player who opened it (or the owner)
/// may do this. Expiry does not come through here: sweep_matches cancels
/// stale invites itself, so this check never blocks the system.
#[reducer]
pub fn cancel_pvp_match(ctx: &ReducerContext, match_id: u64) -> Result<(), String> {
    let Some(m) = ctx.db.pvp_matches().match_id().find(&match_id) else {
        return Err("Match not found".into());
    };
    require_bound(ctx, &m.player1_wallet)
        .map_err(|_| "Only the player who created this match can cancel it".to_string())?;
    if m.status != MatchStatus::Waiting {
        return Err("Only waiting matches can be cancelled".into());
    }
    void_match(ctx, m);
    Ok(())
}

// =========================
// Reducers: Matchmaking Queue
// =========================

#[reducer]
pub fn join_match_queue(ctx: &ReducerContext, wallet: String, match_type: MatchType) -> Result<(), String> {
    if wallet.trim().is_empty() {
        return Err("Wallet cannot be empty".into());
    }
    require_bound(ctx, &wallet)?;
    ensure_player_exists(ctx, &wallet);

    // Prevent duplicate entries for the same wallet by removing existing queue rows
    let mut to_delete: Vec<u64> = Vec::new();
    for row in ctx.db.match_queue().iter() {
        if row.wallet == wallet {
            to_delete.push(row.queue_id);
        }
    }
    for id in to_delete {
        ctx.db.match_queue().queue_id().delete(&id);
    }

    // Merged pools: before queueing, join the earliest public waiting match of
    // this type (invite-code matches stay private)
    let mut waiting: Option<PvpMatch> = None;
    for m in ctx.db.pvp_matches().iter() {
        if m.match_type == match_type
            && m.status == MatchStatus::Waiting
            && m.player2_wallet.is_none()
            && m.join_code.is_none()
            && m.player1_wallet != wallet
        {
            match &waiting {
                None => waiting = Some(m),
                Some(candidate) => {
                    if m.created_at.to_micros_since_unix_epoch()
                        < candidate.created_at.to_micros_since_unix_epoch()
                    {
                        waiting = Some(m);
                    }
                }
            }
        }
    }
    if let Some(mut m) = waiting {
        m.player2_wallet = Some(wallet);
        m.status = MatchStatus::Active;
        m.started_at = Some(ctx.timestamp);
        m.updated_at = ctx.timestamp;
        ctx.db.pvp_matches().match_id().update(m);
        return Ok(());
    }

    // Insert into queue
    let created_at = ctx.timestamp.to_micros_since_unix_epoch();
    let row = MatchQueue {
        queue_id: 0,
        wallet: wallet.clone(),
        match_type: match_type.clone(),
        created_at,
    };

    let inserted = match ctx.db.match_queue().try_insert(row) {
        Ok(r) => r,
        Err(e) => {
            return Err(format!("Failed to join queue: {}", e));
        }
    };

    // Try auto-matching: find earliest waiting opponent of same type
    let mut best_other: Option<MatchQueue> = None;
    for entry in ctx.db.match_queue().iter() {
        if entry.match_type == match_type && entry.wallet != wallet {
            match &best_other {
                None => best_other = Some(entry),
                Some(candidate) => {
                    if entry.created_at < candidate.created_at {
                        best_other = Some(entry);
                    }
                }
            }
        }
    }

    if let Some(other) = best_other {
        // Create match and remove both from queue
        let ts = ctx.timestamp;
        let p1_wallet = other.wallet.clone();
        let p2_wallet = wallet.clone();

        let m = PvpMatch {
            match_id: 0,
            match_type: match_type.clone(),
            player1_wallet: p1_wallet.clone(),
            player2_wallet: Some(p2_wallet.clone()),
            status: MatchStatus::Active,
            join_code: None,
            player1_score: 0,
            player2_score: 0,
            player1_board_state: String::new(),
            player2_board_state: String::new(),
            match_duration_seconds: default_duration_for(&match_type),
            winner_wallet: None,
            created_at: ts,
            started_at: Some(ts),
            completed_at: None,
            updated_at: ts,
        };
        ctx.db.pvp_matches().insert(m);

        // Remove queue rows
        ctx.db.match_queue().queue_id().delete(&other.queue_id);
        ctx.db.match_queue().queue_id().delete(&inserted.queue_id);
    }

    Ok(())
}

#[reducer]
pub fn leave_match_queue(ctx: &ReducerContext, wallet: String) -> Result<(), String> {
    if wallet.trim().is_empty() {
        return Err("Wallet cannot be empty".into());
    }
    require_bound(ctx, &wallet)?;
    let mut to_delete: Vec<u64> = Vec::new();
    for row in ctx.db.match_queue().iter() {
        if row.wallet == wallet {
            to_delete.push(row.queue_id);
        }
    }
    for id in to_delete {
        ctx.db.match_queue().queue_id().delete(&id);
    }
    Ok(())
}

// =========================
// Reducers: Match timeouts
// =========================

/// Expire invites nobody joined, and decide matches somebody walked away
/// from. Runs on a schedule; players never wait on another client.
///
/// - Waiting longer than five minutes (24 hours for an invite code)
///   -> Cancelled, no stats recorded.
/// - Active for five minutes and a player never showed up -> Cancelled.
/// - Active, one player silent for five minutes -> the other player wins.
/// - Active, both silent -> Cancelled, so neither is credited a win.
#[reducer]
pub fn sweep_matches(ctx: &ReducerContext, _schedule: MatchSweeperSchedule) -> Result<(), String> {
    // Scheduled reducers are invoked by the database itself
    if ctx.sender != ctx.identity() {
        return Err("sweep_matches runs on a schedule".into());
    }

    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let stale: Vec<PvpMatch> = ctx.db.pvp_matches().iter().collect();

    for m in stale {
        match m.status {
            MatchStatus::Waiting => {
                let limit = if m.join_code.is_some() { INVITE_TIMEOUT_MICROS } else { MATCH_TIMEOUT_MICROS };
                if now - m.created_at.to_micros_since_unix_epoch() > limit {
                    void_match(ctx, m);
                }
            }
            MatchStatus::Active => {
                let started = m
                    .started_at
                    .unwrap_or(m.created_at)
                    .to_micros_since_unix_epoch();
                // Give both players the full timeout to show up and play
                if now - started <= MATCH_TIMEOUT_MICROS {
                    continue;
                }
                let p1 = presence(ctx, m.match_id, Some(&m.player1_wallet), MATCH_TIMEOUT_MICROS);
                let p2 = presence(ctx, m.match_id, m.player2_wallet.as_deref(), MATCH_TIMEOUT_MICROS);
                match verdict_by_presence(&m, p1, p2) {
                    Verdict::Void => void_match(ctx, m),
                    Verdict::Win(winner) => finalize_match(ctx, m, winner),
                    Verdict::Play => {}
                }
            }
            _ => {}
        }
    }

    Ok(())
}

/// Close single-player runs nobody has touched in a day. The player left
/// without quitting, so the run is finished (or deleted, if it never
/// recorded anything) and the wallet's games count catches up.
#[reducer]
pub fn sweep_runs(ctx: &ReducerContext, _schedule: RunSweeperSchedule) -> Result<(), String> {
    if ctx.sender != ctx.identity() {
        return Err("sweep_runs runs on a schedule".into());
    }

    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let stale: Vec<GameRun> = ctx
        .db
        .game_runs()
        .iter()
        .filter(|r| r.active && now - r.updated_at.to_micros_since_unix_epoch() > STALE_RUN_MICROS)
        .collect();

    let mut wallets: Vec<String> = Vec::new();
    for run in stale {
        if !wallets.contains(&run.wallet) {
            wallets.push(run.wallet.clone());
        }
        close_run(ctx, run);
    }
    for wallet in wallets {
        refresh_player_row(ctx, &wallet);
    }
    Ok(())
}

fn schedule_sweeper(ctx: &ReducerContext) {
    if ctx.db.match_sweeper_schedule().iter().next().is_none() {
        ctx.db.match_sweeper_schedule().insert(MatchSweeperSchedule {
            scheduled_id: 0,
            scheduled_at: ScheduleAt::Interval(TimeDuration::from_micros(SWEEP_INTERVAL_MICROS)),
        });
    }
    if ctx.db.run_sweeper_schedule().iter().next().is_none() {
        ctx.db.run_sweeper_schedule().insert(RunSweeperSchedule {
            scheduled_id: 0,
            scheduled_at: ScheduleAt::Interval(TimeDuration::from_micros(RUN_SWEEP_INTERVAL_MICROS)),
        });
    }
}

/// Runs on a fresh database only, so existing ones need ensure_sweeper.
#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    schedule_sweeper(ctx);
}

/// Owner-only: start the sweepers on a database published before they
/// existed. Safe to call again; a sweeper already scheduled is left alone.
#[reducer]
pub fn ensure_sweeper(ctx: &ReducerContext) -> Result<(), String> {
    if ctx.sender != owner_identity() {
        return Err("Only the database owner may schedule the sweeper".into());
    }
    schedule_sweeper(ctx);
    Ok(())
}

/// Owner-only, one-off repair after the counting fix, safe to repeat:
/// deletes finished runs that never recorded anything (mostly the second
/// row of every double start), then recounts every player's games and PvP
/// record from the runs and matches that remain.
///   spacetime call shootris-game recompute_stats
#[reducer]
pub fn recompute_stats(ctx: &ReducerContext) -> Result<(), String> {
    if ctx.sender != owner_identity() {
        return Err("Only the database owner may recompute stats".into());
    }

    // Open runs are left to their player (or the run sweeper)
    let void_runs: Vec<u64> = ctx
        .db
        .game_runs()
        .iter()
        .filter(|r| !r.active && is_void_run(ctx, r))
        .map(|r| r.run_id)
        .collect();
    for run_id in &void_runs {
        ctx.db.game_runs().run_id().delete(run_id);
    }

    let mut wallets: Vec<String> = ctx.db.players().iter().map(|p| p.wallet).collect();
    for row in ctx.db.pvp_leaderboard().iter() {
        if !wallets.contains(&row.wallet) {
            wallets.push(row.wallet);
        }
    }
    for wallet in &wallets {
        refresh_player_stats(ctx, wallet);
    }

    log::info!(
        "recompute_stats: deleted {} empty runs, recounted {} wallets",
        void_runs.len(),
        wallets.len()
    );
    Ok(())
}

// =========================
// Reducers: Leaderboards
// =========================

#[reducer]
pub fn rebuild_leaderboard(ctx: &ReducerContext) -> Result<(), String> {
    // Clear existing snapshot
    let mut to_delete: Vec<u64> = Vec::new();
    for row in ctx.db.sp_leaderboard().iter() {
        to_delete.push(row.id);
    }
    for id in to_delete {
        ctx.db.sp_leaderboard().id().delete(&id);
    }

    // Aggregate best score, total runs, best lines, best level per wallet
    #[derive(Clone)]
    struct Agg {
        best_score: u64,
        total_runs: u64,
        best_lines: u32,
        best_level: u32,
    }

    let mut agg_by_wallet: HashMap<String, Agg> = HashMap::new();
    for run in ctx.db.game_runs().iter() {
        let entry = agg_by_wallet.entry(run.wallet.clone()).or_insert(Agg {
            best_score: 0,
            total_runs: 0,
            best_lines: 0,
            best_level: 0,
        });
        if run.score > entry.best_score {
            entry.best_score = run.score;
        }
        if run.lines_cleared > entry.best_lines {
            entry.best_lines = run.lines_cleared;
        }
        if run.level_reached > entry.best_level {
            entry.best_level = run.level_reached;
        }
        entry.total_runs = entry.total_runs.saturating_add(1);
    }

    // Convert to vector and sort by best_score desc, then best_lines desc, then best_level desc, then wallet asc
    let mut rows: Vec<(String, Agg)> = agg_by_wallet.into_iter().collect();
    rows.sort_by(|(wa, aa), (wb, ab)| {
        match ab.best_score.cmp(&aa.best_score) {
            Ordering::Equal => match ab.best_lines.cmp(&aa.best_lines) {
                Ordering::Equal => match ab.best_level.cmp(&aa.best_level) {
                    Ordering::Equal => wa.cmp(wb),
                    other => other,
                },
                other => other,
            },
            other => other,
        }
    });

    // Insert ranked entries
    let mut rank: u32 = 1;
    for (wallet, a) in rows {
        let entry = SpLeaderboardEntry {
            id: 0,
            rank,
            wallet,
            best_score: a.best_score,
            total_runs: a.total_runs,
            best_lines: a.best_lines,
            best_level: a.best_level,
        };
        ctx.db.sp_leaderboard().insert(entry);
        rank = rank.saturating_add(1);
    }

    Ok(())
}