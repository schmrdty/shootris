// SpacetimeDB imports must be at the top.
use spacetimedb::{table, reducer, ReducerContext, Identity, Table, Timestamp, SpacetimeType};

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
    total_games: u64,
    total_wins: u64, // Includes single-player wins if used
    pvp_wins: u64,   // Aggregate PvP wins (legacy convenience; detailed stats in pvp_leaderboard)
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

// =========================
/**
 * Internal Helpers
 */
// =========================

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

fn increment_player_counters(ctx: &ReducerContext, wallet: &str, add_game: bool, add_win: bool, add_pvp_win: bool) {
    if let Some(mut player) = ctx.db.players().wallet().find(&wallet.to_string()) {
        if add_game {
            player.total_games = player.total_games.saturating_add(1);
        }
        if add_win {
            player.total_wins = player.total_wins.saturating_add(1);
        }
        if add_pvp_win {
            player.pvp_wins = player.pvp_wins.saturating_add(1);
        }
        player.updated_at = ctx.timestamp;
        ctx.db.players().wallet().update(player);
    }
}

fn ensure_pvp_leaderboard_row(ctx: &ReducerContext, wallet: &str) {
    if ctx.db.pvp_leaderboard().wallet().find(&wallet.to_string()).is_none() {
        let row = PvpLeaderboard {
            wallet: wallet.to_string(),
            floor_duel_wins: 0,
            floor_duel_played: 0,
            score_race_wins: 0,
            score_race_played: 0,
            total_pvp_wins: 0,
            total_pvp_played: 0,
            updated_at: ctx.timestamp,
        };
        ctx.db.pvp_leaderboard().insert(row);
    }
}

fn add_pvp_result(ctx: &ReducerContext, wallet: &str, match_type: &MatchType, won: bool) {
    ensure_pvp_leaderboard_row(ctx, wallet);
    if let Some(mut row) = ctx.db.pvp_leaderboard().wallet().find(&wallet.to_string()) {
        match match_type {
            MatchType::FloorHitDuel => {
                row.floor_duel_played = row.floor_duel_played.saturating_add(1);
                if won {
                    row.floor_duel_wins = row.floor_duel_wins.saturating_add(1);
                }
            }
            MatchType::ScoreRaceTimeTrial => {
                row.score_race_played = row.score_race_played.saturating_add(1);
                if won {
                    row.score_race_wins = row.score_race_wins.saturating_add(1);
                }
            }
        }
        let wins = row.floor_duel_wins.saturating_add(row.score_race_wins);
        let played = row.floor_duel_played.saturating_add(row.score_race_played);
        row.total_pvp_wins = wins;
        row.total_pvp_played = played;
        row.updated_at = ctx.timestamp;
        ctx.db.pvp_leaderboard().wallet().update(row);
    }
}

fn default_duration_for(match_type: &MatchType) -> i64 {
    match match_type {
        MatchType::FloorHitDuel => 0,
        MatchType::ScoreRaceTimeTrial => TIME_TRIAL_DEFAULT_SECONDS,
    }
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
    ensure_player_exists(ctx, &wallet);

    // Deactivate any existing active runs for wallet
    let mut to_update: Vec<GameRun> = Vec::new();
    for run in ctx.db.game_runs().iter() {
        if run.wallet == wallet && run.active {
            to_update.push(run);
        }
    }
    for mut run in to_update {
        run.active = false;
        run.updated_at = ctx.timestamp;
        ctx.db.game_runs().run_id().update(run);
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

    // Count as a game started
    increment_player_counters(ctx, &wallet, true, false, false);

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
    if let Some(mut run) = ctx.db.game_runs().run_id().find(&run_id) {
        let wallet_clone = run.wallet.clone();
        let was_active = run.active;

        run.score = score;
        run.lines_cleared = lines_cleared;
        run.level_reached = level_reached;
        run.board_state = board_state;
        run.active = active;
        run.updated_at = ctx.timestamp;

        ctx.db.game_runs().run_id().update(run);

        // If the run transitioned to inactive, and it's a win, increment player's wins
        if was_active && !active {
            if won {
                increment_player_counters(ctx, &wallet_clone, false, true, false);
            }
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
    if let Some(mut m) = ctx.db.pvp_matches().match_id().find(&match_id) {
        if m.status != MatchStatus::Active && m.status != MatchStatus::Waiting {
            return Err("Cannot update board for a completed or cancelled match".into());
        }
        if m.player1_wallet == wallet {
            m.player1_board_state = board_state;
            m.player1_score = score;
        } else if m.player2_wallet.as_ref().map(|w| w == &wallet).unwrap_or(false) {
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
    if let Some(mut m) = ctx.db.pvp_matches().match_id().find(&match_id) {
        if m.status == MatchStatus::Completed || m.status == MatchStatus::Cancelled {
            return Err("Match is already finalized".into());
        }
        // Validate winner is a participant
        let winner_is_p1 = m.player1_wallet == winner_wallet;
        let winner_is_p2 = m.player2_wallet.as_ref().map(|w| w == &winner_wallet).unwrap_or(false);
        if !winner_is_p1 && !winner_is_p2 {
            return Err("Winner must be a participant".into());
        }

        // Determine participants
        let p1 = m.player1_wallet.clone();
        let p2_opt = m.player2_wallet.clone();

        // Increment total games for both participants (if second exists)
        increment_player_counters(ctx, &p1, true, false, true);
        if let Some(p2) = p2_opt.clone() {
            increment_player_counters(ctx, &p2, true, false, true);
        }

        // Update PvP leaderboard stats per mode
        add_pvp_result(ctx, &p1, &m.match_type, winner_is_p1);
        if let Some(p2) = p2_opt {
            add_pvp_result(ctx, &p2, &m.match_type, winner_is_p2);
        }

        m.status = MatchStatus::Completed;
        m.winner_wallet = Some(winner_wallet);
        m.completed_at = Some(ctx.timestamp);
        if m.started_at.is_none() {
            m.started_at = Some(ctx.timestamp);
        }
        m.updated_at = ctx.timestamp;
        ctx.db.pvp_matches().match_id().update(m);

        Ok(())
    } else {
        Err("Match not found".into())
    }
}

#[reducer]
pub fn cancel_pvp_match(ctx: &ReducerContext, match_id: u64) -> Result<(), String> {
    if let Some(mut m) = ctx.db.pvp_matches().match_id().find(&match_id) {
        if m.status != MatchStatus::Waiting {
            return Err("Only waiting matches can be cancelled".into());
        }
        m.status = MatchStatus::Cancelled;
        m.updated_at = ctx.timestamp;
        ctx.db.pvp_matches().match_id().update(m);
        Ok(())
    } else {
        Err("Match not found".into())
    }
}

// =========================
// Reducers: Matchmaking Queue
// =========================

#[reducer]
pub fn join_match_queue(ctx: &ReducerContext, wallet: String, match_type: MatchType) -> Result<(), String> {
    if wallet.trim().is_empty() {
        return Err("Wallet cannot be empty".into());
    }
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