// WS-4 §3.2 — shift-click secondary-target flow (graph-native shortcut).
//
// Unit-level test of the helpers extracted into
// `app/src/components/network/shift-click.ts`. The sigma component
// delegates to these helpers, so exercising them here proves the
// shift-click flow without needing jsdom/React.

import {
  isShiftClick,
  setSecondaryTargetViaShiftClick,
} from '@/components/network/shift-click';

describe('isShiftClick', () => {
  it('returns true when the original event has shiftKey=true', () => {
    expect(isShiftClick({ original: { shiftKey: true } as unknown as MouseEvent })).toBe(true);
  });

  it('returns false when the event is missing or non-shifted', () => {
    expect(isShiftClick(undefined)).toBe(false);
    expect(isShiftClick({ original: { shiftKey: false } as unknown as MouseEvent })).toBe(false);
  });
});

describe('setSecondaryTargetViaShiftClick', () => {
  it('POSTs /api/targets then PUTs /api/targets/state with the new id', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method as string) ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });
      if (url === '/api/targets' && method === 'POST') {
        return new Response(JSON.stringify({ data: { id: 'target-new' } }), {
          status: 200,
        });
      }
      if (url === '/api/targets/state' && method === 'PUT') {
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    };

    const result = await setSecondaryTargetViaShiftClick('contact-abc', fetchImpl);
    expect(result.ok).toBe(true);
    expect(result.secondaryTargetId).toBe('target-new');

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      url: '/api/targets',
      method: 'POST',
      body: { kind: 'contact', id: 'contact-abc' },
    });
    expect(calls[1]).toEqual({
      url: '/api/targets/state',
      method: 'PUT',
      body: { secondaryTargetId: 'target-new' },
    });
  });

  it('returns ok=false silently when the POST /api/targets call fails', async () => {
    let putCalled = false;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url === '/api/targets' && init?.method === 'POST') {
        return new Response('boom', { status: 500 });
      }
      if (url === '/api/targets/state') {
        putCalled = true;
      }
      return new Response('{}', { status: 200 });
    };

    const result = await setSecondaryTargetViaShiftClick('contact-abc', fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.secondaryTargetId).toBeUndefined();
    expect(putCalled).toBe(false);
  });

  it('swallows thrown errors and returns ok=false', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('network down');
    };
    const result = await setSecondaryTargetViaShiftClick('contact-abc', fetchImpl);
    expect(result.ok).toBe(false);
  });
});
