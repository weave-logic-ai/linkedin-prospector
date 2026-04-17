// WS-2 Phase 2 Track D — verifies the PONG_TIMEOUT_MS fix in
// `app/src/lib/websocket/ws-server.ts`. Previously the constant was
// commented out and the heartbeat had no pong-timeout enforcement
// (stub-inventory.md:25). This test locks the fix in.

import fs from 'fs';
import path from 'path';

const WS_PATH = path.resolve(
  __dirname,
  '../../app/src/lib/websocket/ws-server.ts',
);

describe('ws-server pong-timeout fix', () => {
  const src = fs.readFileSync(WS_PATH, 'utf8');

  it('PONG_TIMEOUT_MS is defined (no longer commented out)', () => {
    expect(src).toMatch(/^const PONG_TIMEOUT_MS = 10_000;/m);
    // Ensure the old "Reserved for future" comment is gone.
    expect(src).not.toMatch(/Reserved for future heartbeat enhancement/);
  });

  it('AuthenticatedSocket tracks lastPingAt', () => {
    expect(src).toMatch(/lastPingAt\?: number/);
  });

  it('pong listener clears lastPingAt', () => {
    expect(src).toMatch(/ws\.on\('pong',[\s\S]*?ws\.lastPingAt = undefined/);
  });

  it('heartbeat terminates connections past the pong timeout', () => {
    expect(src).toMatch(
      /now - client\.lastPingAt >= PONG_TIMEOUT_MS[\s\S]*?client\.terminate\(\)/,
    );
  });
});
