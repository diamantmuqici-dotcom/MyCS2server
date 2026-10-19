import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pool, type PoolClient } from 'pg';

export type SqlParam = string | number | null;

export interface Db {
  readonly driver: 'sqlite' | 'postgres';
  readonly inTransaction: boolean;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  /** Returns the number of affected rows. */
  run(sql: string, params?: SqlParam[]): Promise<number>;
  /** Executes one or more statements without parameters (migrations, pragmas). */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolveTail) => {
      release = resolveTail;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

function toSqlitePath(databaseUrl: string): string {
  let raw = databaseUrl.replace(/^sqlite:/, '');
  raw = raw.replace(/^\/\//, '');
  if (raw === ':memory:' || raw === 'memory:' || raw === '') return ':memory:';
  return resolve(raw);
}

class SqliteDb implements Db {
  readonly driver = 'sqlite' as const;
  readonly inTransaction: boolean;
  private readonly db: DatabaseSync;
  private readonly mutex: Mutex;
  private readonly filePath: string;

  constructor(db: DatabaseSync, mutex: Mutex, filePath: string, inTransaction = false) {
    this.db = db;
    this.mutex = mutex;
    this.filePath = filePath;
    this.inTransaction = inTransaction;
  }

  private select(sql: string, params: SqlParam[]): Record<string, unknown>[] {
    const prepared = this.db.prepare(sql);
    return prepared.all(...(params as unknown as never[])) as Record<string, unknown>[];
  }

  all<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    if (this.inTransaction) return Promise.resolve(this.select(sql, params) as T[]);
    return this.mutex.run(() => this.select(sql, params) as T[]);
  }

  async get<T>(sql: string, params: SqlParam[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  run(sql: string, params: SqlParam[] = []): Promise<number> {
    const execute = () => {
      const prepared = this.db.prepare(sql);
      const result = prepared.run(...(params as unknown as never[]));
      return Number(result.changes ?? 0);
    };
    if (this.inTransaction) return Promise.resolve(execute());
    return this.mutex.run(execute);
  }

  exec(sql: string): Promise<void> {
    const execute = () => {
      this.db.exec(sql);
    };
    if (this.inTransaction) {
      execute();
      return Promise.resolve();
    }
    return this.mutex.run(execute);
  }

  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    return this.mutex.run(async () => {
      const tx = new SqliteDb(this.db, this.mutex, this.filePath, true);
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(tx);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* the transaction may already have been rolled back by SQLite */
        }
        throw error;
      }
    });
  }

  close(): Promise<void> {
    return this.mutex.run(() => {
      this.db.close();
    });
  }
}

function convertPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

class PostgresDb implements Db {
  readonly driver = 'postgres' as const;
  readonly inTransaction: boolean;
  constructor(
    private readonly client: Pool | PoolClient,
    inTransaction = false,
  ) {
    this.inTransaction = inTransaction;
  }

  async all<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const result = await this.client.query(convertPlaceholders(sql), params);
    return result.rows as T[];
  }

  async get<T>(sql: string, params: SqlParam[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  async run(sql: string, params: SqlParam[] = []): Promise<number> {
    const result = await this.client.query(convertPlaceholders(sql), params);
    return result.rowCount ?? 0;
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    if (!(this.client instanceof Pool))
      throw new Error('Nested transactional client is not a pool');
    const client = await this.client.connect();
    try {
      await client.query('BEGIN');
      const tx = new PostgresDb(client, true);
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* connection may already be gone */
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.client instanceof Pool) await this.client.end();
  }
}

export interface CreateDbOptions {
  /** PostgreSQL pool size (ignored for SQLite). */
  maxConnections?: number;
}

export async function createDb(databaseUrl: string, options: CreateDbOptions = {}): Promise<Db> {
  if (!databaseUrl) throw new Error('DATABASE_URL is empty.');
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: options.maxConnections ?? 10,
    });
    const db = new PostgresDb(pool);
    await db.get('SELECT 1 AS ok');
    return db;
  }
  if (!databaseUrl.startsWith('sqlite:')) {
    throw new Error('DATABASE_URL must start with sqlite: or postgresql://');
  }
  const filePath = toSqlitePath(databaseUrl);
  if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true });
  const raw = new DatabaseSync(filePath);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec('PRAGMA busy_timeout = 5000;');
  return new SqliteDb(raw, new Mutex(), filePath);
}
