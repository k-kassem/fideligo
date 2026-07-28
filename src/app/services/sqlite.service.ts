import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { INITIAL_ADMIN } from '../types';

export type SqliteConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

@Injectable({
  providedIn: 'root'
})
export class SqliteService {
  private static readonly DB_STORAGE_KEY = 'fidelite_sqlite_db';

  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private initPromise: Promise<void> | null = null;
  private inTransaction = false;

  private statusSubject = new BehaviorSubject<SqliteConnectionStatus>('disconnected');
  readonly status$ = this.statusSubject.asObservable();

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.statusSubject.next('connecting');

    this.initPromise = (async () => {
      this.SQL = await initSqlJs({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
      });

      const existingDbBytes = this.loadDatabaseBytes();
      this.db = existingDbBytes ? new this.SQL.Database(existingDbBytes) : new this.SQL.Database();

      this.createSchema();
      this.seedInitialData();
      this.db.run('INSERT INTO healthcheck (created_at) VALUES (?)', [new Date().toISOString()]);
      this.persist();

      this.statusSubject.next('connected');
    })().catch((error) => {
      this.statusSubject.next('error');
      this.initPromise = null;
      throw error;
    });

    return this.initPromise;
  }

  isReady(): boolean {
    return !!this.db;
  }

  run(sql: string, params: any[] = []): void {
    const db = this.getDbOrThrow();
    db.run(sql, params);
    if (!this.inTransaction) {
      this.persist();
    }
  }

  query<T = Record<string, unknown>>(sql: string, params: any[] = []): T[] {
    const db = this.getDbOrThrow();
    const stmt = db.prepare(sql, params);
    const rows: T[] = [];

    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }

    stmt.free();
    return rows;
  }

  queryOne<T = Record<string, unknown>>(sql: string, params: any[] = []): T | null {
    const rows = this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  transaction<T>(callback: () => T): T {
    const db = this.getDbOrThrow();
    db.run('BEGIN TRANSACTION');
    this.inTransaction = true;
    try {
      const result = callback();
      db.run('COMMIT');
      this.inTransaction = false;
      this.persist();
      return result;
    } catch (error) {
      db.run('ROLLBACK');
      this.inTransaction = false;
      this.persist();
      throw error;
    }
  }

  persist(): void {
    if (!this.db) {
      return;
    }

    const exported = this.db.export();
    const encoded = this.uint8ToBase64(exported);
    localStorage.setItem(SqliteService.DB_STORAGE_KEY, encoded);
  }

  private loadDatabaseBytes(): Uint8Array | null {
    const encoded = localStorage.getItem(SqliteService.DB_STORAGE_KEY);
    if (!encoded) {
      return null;
    }

    try {
      return this.base64ToUint8(encoded);
    } catch {
      localStorage.removeItem(SqliteService.DB_STORAGE_KEY);
      return null;
    }
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000;
    let binary = '';

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  private base64ToUint8(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  private createSchema(): void {
    if (!this.db) {
      return;
    }

    this.db.run('PRAGMA foreign_keys = ON');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'restaurant', 'client')),
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS restaurants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        description TEXT NOT NULL,
        user_id TEXT NOT NULL UNIQUE,
        subscription_end_date TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL,
        region TEXT NOT NULL,
        user_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        restaurant_id TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        points_earned INTEGER NOT NULL DEFAULT 0 CHECK(points_earned >= 0),
        points_used INTEGER NOT NULL DEFAULT 0 CHECK(points_used >= 0),
        description TEXT NOT NULL,
        date TEXT NOT NULL,
        FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY(restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS points_balances (
        client_id TEXT NOT NULL,
        restaurant_id TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(client_id, restaurant_id),
        FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY(restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS current_session (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        user_id TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS healthcheck (
        id INTEGER PRIMARY KEY,
        created_at TEXT NOT NULL
      )
    `);

    this.db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_restaurants_email ON restaurants(email)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_restaurants_user_id ON restaurants(user_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_purchases_client_id ON purchases(client_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_purchases_restaurant_id ON purchases(restaurant_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_points_balances_client_id ON points_balances(client_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_points_balances_restaurant_id ON points_balances(restaurant_id)');
  }

  private seedInitialData(): void {
    if (!this.db) {
      return;
    }

    const now = new Date().toISOString();

    this.db.run(
      `
        INSERT INTO users (id, email, password, role, name, created_at)
        SELECT ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM users WHERE lower(email) = lower(?)
        )
      `,
      [
        this.generateId(),
        INITIAL_ADMIN.email,
        INITIAL_ADMIN.password,
        'admin',
        INITIAL_ADMIN.name,
        now,
        INITIAL_ADMIN.email
      ]
    );

    this.db.run(
      `
        INSERT INTO current_session (id, user_id, updated_at)
        SELECT 1, NULL, ?
        WHERE NOT EXISTS (SELECT 1 FROM current_session WHERE id = 1)
      `,
      [now]
    );
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private getDbOrThrow(): Database {
    if (!this.db) {
      throw new Error('SQLite database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  async testConnection(): Promise<{ ok: boolean; sqliteVersion?: string; error?: string }> {
    try {
      await this.initialize();

      if (!this.db) {
        return { ok: false, error: 'Database instance is not initialized.' };
      }

      const result = this.db.exec('SELECT sqlite_version() as version');
      const sqliteVersion = result[0]?.values?.[0]?.[0];

      return {
        ok: true,
        sqliteVersion: typeof sqliteVersion === 'string' ? sqliteVersion : 'unknown'
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown SQLite error'
      };
    }
  }
}