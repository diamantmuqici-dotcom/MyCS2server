import { describe, expect, it } from 'vitest';
import { parseConnectAddress, parseInfoResponse } from '../../apps/api/src/services/a2s.js';

function cstring(value: string): Buffer {
  return Buffer.from(`${value}\0`, 'utf8');
}

function infoPacket(): Buffer {
  const header = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49, 17]);
  const appId = Buffer.alloc(2);
  appId.writeUInt16LE(730);
  return Buffer.concat([
    header,
    cstring('Dardania | Elite #1'),
    cstring('de_mirage'),
    cstring('csgo'),
    cstring('Counter-Strike 2'),
    appId,
    Buffer.from([12, 20, 1, 0x64, 0x6c, 0, 1]),
    cstring('1.40.0.0'),
  ]);
}

describe('A2S server status', () => {
  it('parses host:port with fallbacks', () => {
    expect(parseConnectAddress('1.2.3.4:27015')).toEqual({ host: '1.2.3.4', port: 27015 });
    expect(parseConnectAddress('connect cs.example.com:27016')).toEqual({
      host: 'cs.example.com',
      port: 27016,
    });
    expect(parseConnectAddress('cs.example.com')).toEqual({ host: 'cs.example.com', port: 27015 });
    expect(parseConnectAddress('cs.example.com:0')).toBeNull();
    expect(parseConnectAddress('cs.example.com:99999')).toBeNull();
    expect(parseConnectAddress('   ')).toBeNull();
  });

  it('parses a real-shaped A2S_INFO response', () => {
    const info = parseInfoResponse(infoPacket());
    expect(info.name).toBe('Dardania | Elite #1');
    expect(info.map).toBe('de_mirage');
    expect(info.players).toBe(12);
    expect(info.maxPlayers).toBe(20);
    expect(info.bots).toBe(1);
  });

  it('rejects responses that are not A2S_INFO', () => {
    expect(() =>
      parseInfoResponse(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x41, 1, 2, 3, 4])),
    ).toThrow(/Unexpected A2S_INFO/);
  });
});
