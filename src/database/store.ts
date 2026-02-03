import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { TokenLaunch, WatchlistEntry, Alert, SortOption } from '../types';

export class LaunchStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  private createTables(): void {
    // Main launches table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS launches (
        pair_address TEXT PRIMARY KEY,
        token_address TEXT NOT NULL,
        name TEXT,
        symbol TEXT,
        dex_id TEXT,
        price_usd REAL,
        market_cap REAL,
        volume_24h REAL,
        liquidity_usd REAL,
        price_change_24h REAL,
        pair_created_at INTEGER,
        dexscreener_url TEXT,
        last_updated INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_created_at ON launches(pair_created_at);
      CREATE INDEX IF NOT EXISTS idx_volume ON launches(volume_24h);
      CREATE INDEX IF NOT EXISTS idx_market_cap ON launches(market_cap);
      CREATE INDEX IF NOT EXISTS idx_token_address ON launches(token_address);
    `);

    // Watchlist table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        token_address TEXT NOT NULL,
        added_at INTEGER,
        UNIQUE(user_id, token_address)
      );

      CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
    `);

    // Alerts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        token_address TEXT NOT NULL,
        condition_type TEXT NOT NULL,
        operator TEXT NOT NULL,
        threshold REAL NOT NULL,
        triggered INTEGER DEFAULT 0,
        created_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_token ON alerts(token_address);
      CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered);
    `);
  }

  // Launch methods
  upsertLaunch(launch: TokenLaunch): void {
    const stmt = this.db.prepare(`
      INSERT INTO launches (
        pair_address, token_address, name, symbol, dex_id,
        price_usd, market_cap, volume_24h, liquidity_usd,
        price_change_24h, pair_created_at, dexscreener_url, last_updated
      ) VALUES (
        @pairAddress, @tokenAddress, @name, @symbol, @dexId,
        @priceUsd, @marketCap, @volume24h, @liquidityUsd,
        @priceChange24h, @pairCreatedAt, @dexscreenerUrl, @lastUpdated
      )
      ON CONFLICT(pair_address) DO UPDATE SET
        price_usd = @priceUsd,
        market_cap = @marketCap,
        volume_24h = @volume24h,
        liquidity_usd = @liquidityUsd,
        price_change_24h = @priceChange24h,
        last_updated = @lastUpdated
    `);

    stmt.run(launch);
  }

  upsertLaunches(launches: TokenLaunch[]): void {
    const upsert = this.db.transaction((items: TokenLaunch[]) => {
      for (const launch of items) {
        this.upsertLaunch(launch);
      }
    });
    upsert(launches);
  }

  getLaunches(timeframeHours: number, sortBy: SortOption, limit: number = 15): TokenLaunch[] {
    const cutoffTime = Date.now() - timeframeHours * 60 * 60 * 1000;

    let orderClause: string;
    switch (sortBy) {
      case 'mcap':
        orderClause = 'market_cap DESC NULLS LAST';
        break;
      case 'age':
        orderClause = 'pair_created_at DESC';
        break;
      case 'volume':
      default:
        orderClause = 'volume_24h DESC NULLS LAST';
        break;
    }

    const stmt = this.db.prepare(`
      SELECT
        pair_address as pairAddress,
        token_address as tokenAddress,
        name,
        symbol,
        dex_id as dexId,
        price_usd as priceUsd,
        market_cap as marketCap,
        volume_24h as volume24h,
        liquidity_usd as liquidityUsd,
        price_change_24h as priceChange24h,
        pair_created_at as pairCreatedAt,
        dexscreener_url as dexscreenerUrl,
        last_updated as lastUpdated
      FROM launches
      WHERE pair_created_at >= ?
      ORDER BY ${orderClause}
      LIMIT ?
    `);

    return stmt.all(cutoffTime, limit) as TokenLaunch[];
  }

  getLaunchByToken(tokenAddress: string): TokenLaunch | undefined {
    const stmt = this.db.prepare(`
      SELECT
        pair_address as pairAddress,
        token_address as tokenAddress,
        name,
        symbol,
        dex_id as dexId,
        price_usd as priceUsd,
        market_cap as marketCap,
        volume_24h as volume24h,
        liquidity_usd as liquidityUsd,
        price_change_24h as priceChange24h,
        pair_created_at as pairCreatedAt,
        dexscreener_url as dexscreenerUrl,
        last_updated as lastUpdated
      FROM launches
      WHERE token_address = ?
      ORDER BY volume_24h DESC
      LIMIT 1
    `);

    return stmt.get(tokenAddress.toLowerCase()) as TokenLaunch | undefined;
  }

  getTrendingLaunches(limit: number = 10): TokenLaunch[] {
    // Trending = high volume + high price change in last 24h
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;

    const stmt = this.db.prepare(`
      SELECT
        pair_address as pairAddress,
        token_address as tokenAddress,
        name,
        symbol,
        dex_id as dexId,
        price_usd as priceUsd,
        market_cap as marketCap,
        volume_24h as volume24h,
        liquidity_usd as liquidityUsd,
        price_change_24h as priceChange24h,
        pair_created_at as pairCreatedAt,
        dexscreener_url as dexscreenerUrl,
        last_updated as lastUpdated
      FROM launches
      WHERE pair_created_at >= ?
        AND volume_24h > 0
        AND liquidity_usd > 0
      ORDER BY (volume_24h * ABS(COALESCE(price_change_24h, 0) + 1)) DESC
      LIMIT ?
    `);

    return stmt.all(cutoffTime, limit) as TokenLaunch[];
  }

  pruneOldLaunches(maxAgeHours: number = 48): number {
    const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const stmt = this.db.prepare('DELETE FROM launches WHERE pair_created_at < ?');
    const result = stmt.run(cutoffTime);
    return result.changes;
  }

  // Watchlist methods
  addToWatchlist(userId: string, tokenAddress: string): boolean {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO watchlist (user_id, token_address, added_at)
        VALUES (?, ?, ?)
      `);
      stmt.run(userId, tokenAddress.toLowerCase(), Date.now());
      return true;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return false; // Already exists
      }
      throw error;
    }
  }

  removeFromWatchlist(userId: string, tokenAddress: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM watchlist WHERE user_id = ? AND token_address = ?
    `);
    const result = stmt.run(userId, tokenAddress.toLowerCase());
    return result.changes > 0;
  }

  getWatchlist(userId: string): WatchlistEntry[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id as userId, token_address as tokenAddress, added_at as addedAt
      FROM watchlist
      WHERE user_id = ?
      ORDER BY added_at DESC
    `);
    return stmt.all(userId) as WatchlistEntry[];
  }

  // Alert methods
  createAlert(
    userId: string,
    tokenAddress: string,
    conditionType: 'price' | 'volume' | 'mcap',
    operator: '>' | '<' | '=',
    threshold: number
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (user_id, token_address, condition_type, operator, threshold, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, tokenAddress.toLowerCase(), conditionType, operator, threshold, Date.now());
    return result.lastInsertRowid as number;
  }

  deleteAlert(alertId: number, userId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?');
    const result = stmt.run(alertId, userId);
    return result.changes > 0;
  }

  getUserAlerts(userId: string): Alert[] {
    const stmt = this.db.prepare(`
      SELECT
        id, user_id as userId, token_address as tokenAddress,
        condition_type as conditionType, operator, threshold,
        triggered, created_at as createdAt
      FROM alerts
      WHERE user_id = ?
      ORDER BY created_at DESC
    `);
    return stmt.all(userId) as Alert[];
  }

  getActiveAlerts(): Alert[] {
    const stmt = this.db.prepare(`
      SELECT
        id, user_id as userId, token_address as tokenAddress,
        condition_type as conditionType, operator, threshold,
        triggered, created_at as createdAt
      FROM alerts
      WHERE triggered = 0
    `);
    return stmt.all() as Alert[];
  }

  markAlertTriggered(alertId: number): void {
    const stmt = this.db.prepare('UPDATE alerts SET triggered = 1 WHERE id = ?');
    stmt.run(alertId);
  }

  close(): void {
    this.db.close();
  }
}
