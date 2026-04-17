// WS-2 Phase 2 Track D — createParseCompleteEvent payload shape.
// Per `08-phased-delivery.md` §4.1: the WS push is
//   { type: 'PARSE_COMPLETE', captureId, pageType, fields }

import { createParseCompleteEvent } from '@/lib/websocket/ws-events';

describe('createParseCompleteEvent', () => {
  it('matches the Track D spec shape', () => {
    const e = createParseCompleteEvent('cap-1', 'PROFILE', [
      { field: 'name', confidence: 0.9 },
      { field: 'headline', confidence: 0.8 },
    ]);
    expect(e.type).toBe('PARSE_COMPLETE');
    expect(e.payload).toEqual({
      captureId: 'cap-1',
      pageType: 'PROFILE',
      fields: [
        { field: 'name', confidence: 0.9 },
        { field: 'headline', confidence: 0.8 },
      ],
    });
    // ISO timestamp.
    expect(new Date(e.timestamp).toISOString()).toBe(e.timestamp);
  });

  it('accepts an empty fields array', () => {
    const e = createParseCompleteEvent('cap-2', 'COMPANY', []);
    expect((e.payload as { fields: unknown[] }).fields).toEqual([]);
  });
});
