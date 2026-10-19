/**
 * Minimal, dependency-free A2S_INFO client for Counter-Strike 2 servers.
 *
 * Player counts on the public site are only shown when a real UDP query
 * succeeds. Failures are surfaced as OFFLINE/UNKNOWN — never invented.
 */
import { createSocket, type Socket } from 'node:dgram';
import type { PublicServerStateDto } from '@dardania/shared';

export interface A2sInfo {
  name: string;
  map: string;
  players: number;
  maxPlayers: number;
  bots: number;
  pingMs: number;
}

export interface A2sTarget {
  label: string;
  connect: string;
}

const CACHE_TTL_MS = 30_000;
const DEFAULT_PORT = 27015;
const DEFAULT_TIMEOUT_MS = 1_500;

interface CacheEntry {
  at: number;
  state: PublicServerStateDto;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PublicServerStateDto>>();

/** Splits "host:port", tolerating "connect host:port" and bare hosts. */
export function parseConnectAddress(
  connect: string,
  fallbackPort = DEFAULT_PORT,
): { host: string; port: number } | null {
  const cleaned = connect.trim().replace(/^connect\s+/i, '').split(/[\s/]/)[0] ?? '';
  if (!cleaned) return null;
  const separator = cleaned.lastIndexOf(':');
  if (separator === -1) return { host: cleaned, port: fallbackPort };
  const host = cleaned.slice(0, separator).trim();
  const port = Number(cleaned.slice(separator + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

function readCString(buffer: Buffer, offset: number): { value: string; next: number } {
  const end = buffer.indexOf(0, offset);
  if (end === -1) throw new Error('Unterminated string in A2S response');
  return { value: buffer.toString('utf8', offset, end), next: end + 1 };
}

/** Parses the body of an A2S_INFO response (single packet). */
export function parseInfoResponse(buffer: Buffer): A2sInfo {
  let offset = 4;
  const type = buffer.readUInt8(offset);
  offset += 1;
  if (type !== 0x49) {
    throw new Error(`Unexpected A2S_INFO response type 0x${type.toString(16)}`);
  }
  offset += 1; // protocol version
  const name = readCString(buffer, offset);
  offset = name.next;
  const map = readCString(buffer, offset);
  offset = map.next;
  const folder = readCString(buffer, offset);
  offset = folder.next;
  const game = readCString(buffer, offset);
  offset = game.next;
  offset += 2; // app id
  const players = buffer.readUInt8(offset);
  const maxPlayers = buffer.readUInt8(offset + 1);
  const bots = buffer.readUInt8(offset + 2);
  return {
    name: name.value,
    map: map.value,
    players,
    maxPlayers,
    bots,
    pingMs: 0,
  };
}

function buildRequest(challenge?: Buffer): Buffer {
  const base = Buffer.concat([
    Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]),
    Buffer.from('Source Engine Query\0', 'utf8'),
  ]);
  if (challenge && challenge.length >= 4) {
    return Buffer.concat([base, challenge.subarray(0, 4)]);
  }
  return base;
}

function queryOnce(
  host: string,
  port: number,
  timeoutMs: number,
  challenge?: Buffer,
): Promise<{ info: A2sInfo; pingMs: number } | { challenge: Buffer }> {
  return new Promise((resolve, reject) => {
    const socket: Socket = createSocket('udp4');
    let settled = false;
    const started = Date.now();
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      socket.close();
      action();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error('A2S query timed out'))),
      timeoutMs,
    );
    socket.on('error', (error) => {
      clearTimeout(timer);
      finish(() => reject(error));
    });
    socket.on('message', (message) => {
      clearTimeout(timer);
      try {
        if (message.length >= 9 && message[4] === 0x41) {
          const challengeBytes = message.subarray(5, 9);
          finish(() => resolve({ challenge: challengeBytes }));
          return;
        }
        const info = parseInfoResponse(message);
        info.pingMs = Date.now() - started;
        finish(() => resolve({ info, pingMs: info.pingMs }));
      } catch (error) {
        finish(() => reject(error as Error));
      }
    });
    socket.send(buildRequest(challenge), port, host, (error) => {
      if (error) {
        clearTimeout(timer);
        finish(() => reject(error));
      }
    });
  });
}

export async function queryServer(
  host: string,
  port: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<A2sInfo> {
  const first = await queryOnce(host, port, timeoutMs);
  if ('info' in first) return first.info;
  const second = await queryOnce(host, port, timeoutMs, first.challenge);
  if ('info' in second) return second.info;
  throw new Error('Server did not return A2S_INFO after the challenge exchange');
}

export async function checkServer(
  target: A2sTarget,
  options: { timeoutMs?: number; cacheTtlMs?: number; now?: () => string } = {},
): Promise<PublicServerStateDto> {
  const cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
  const cached = cache.get(target.connect);
  if (cached && Date.now() - cached.at < cacheTtlMs) return cached.state;

  const existing = inflight.get(target.connect);
  if (existing) return existing;

  const now = options.now ?? (() => new Date().toISOString());
  const checkedAt = now();
  const task = (async (): Promise<PublicServerStateDto> => {
    const address = parseConnectAddress(target.connect);
    if (!address) {
      return {
        label: target.label,
        connect: target.connect,
        status: 'UNKNOWN',
        players: null,
        maxPlayers: null,
        map: null,
        bots: null,
        pingMs: null,
        lastCheckedAt: checkedAt,
        detail: 'The configured address is not a valid host:port pair.',
      };
    }
    try {
      const info = await queryServer(address.host, address.port, options.timeoutMs);
      return {
        label: target.label,
        connect: target.connect,
        status: 'ONLINE',
        players: info.players,
        maxPlayers: info.maxPlayers,
        map: info.map,
        bots: info.bots,
        pingMs: info.pingMs,
        lastCheckedAt: checkedAt,
        detail: null,
      };
    } catch (error) {
      return {
        label: target.label,
        connect: target.connect,
        status: 'OFFLINE',
        players: null,
        maxPlayers: null,
        map: null,
        bots: null,
        pingMs: null,
        lastCheckedAt: checkedAt,
        detail: (error as Error).message,
      };
    } finally {
      inflight.delete(target.connect);
    }
  })();

  inflight.set(target.connect, task);
  const state = await task;
  cache.set(target.connect, { at: Date.now(), state });
  return state;
}

/** Test helper: clears the module-level cache. */
export function resetA2sCache(): void {
  cache.clear();
  inflight.clear();
}
