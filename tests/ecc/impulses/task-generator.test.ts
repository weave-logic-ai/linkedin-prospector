// task-generator handler tests

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { query } from '@/lib/db/client';
import { executeTaskGenerator } from '@/lib/ecc/impulses/handlers/task-generator';
import type { Impulse } from '@/lib/ecc/types';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as ReturnType<typeof query>;
}

function baseImpulse(overrides: Partial<Impulse> = {}): Impulse {
  return {
    id: 'imp-1', tenantId: 't', impulseType: 'tier_changed',
    sourceEntityType: 'contact', sourceEntityId: 'c1',
    payload: { from: 'silver', to: 'gold' },
    createdAt: '2026-01-01',
    ...overrides,
  };
}

describe('executeTaskGenerator', () => {
  beforeEach(() => mockQuery.mockReset());

  it('creates a SEND_MESSAGE task when tier_changed to gold', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{ full_name: 'Jane Smith' }])); // contact name
    mockQuery.mockReturnValueOnce(mockRows([])); // no existing pending task
    mockQuery.mockReturnValueOnce(mockRows([])); // insert

    const result = await executeTaskGenerator(baseImpulse(), {});
    expect(result).toEqual({ tasksCreated: 1, tasksSkipped: 0 });

    const insertCall = mockQuery.mock.calls[2];
    expect(String(insertCall[0])).toMatch(/INSERT INTO tasks/);
    const params = insertCall[1] as unknown[];
    expect(params[0]).toContain('Jane Smith');
    expect(params[2]).toBe('SEND_MESSAGE');
    // INSERT positional args: [title, description, taskType, priority, contactId]
    // (status='pending' and source='impulse' are literals in the SQL.)
    expect(params[4]).toBe('c1');
  });

  it('deduplicates when a pending task already exists', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{ full_name: 'Jane Smith' }])); // contact name
    mockQuery.mockReturnValueOnce(mockRows([{ id: 'existing-task-id' }])); // existing pending

    const result = await executeTaskGenerator(baseImpulse(), {});
    expect(result).toEqual({ tasksCreated: 0, tasksSkipped: 1 });

    // No INSERT INTO tasks should have occurred
    const inserts = mockQuery.mock.calls.filter(c => String(c[0]).includes('INSERT INTO tasks'));
    expect(inserts).toHaveLength(0);
  });

  it('creates RESEARCH task when persona_assigned to buyer', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{ full_name: 'John Buyer' }]));
    mockQuery.mockReturnValueOnce(mockRows([])); // no existing
    mockQuery.mockReturnValueOnce(mockRows([])); // insert

    const imp = baseImpulse({
      impulseType: 'persona_assigned',
      payload: { to: 'buyer' },
    });
    const result = await executeTaskGenerator(imp, {});
    expect(result.tasksCreated).toBe(1);
    const insertCall = mockQuery.mock.calls[2];
    const params = insertCall[1] as unknown[];
    expect(params[2]).toBe('RESEARCH');
  });

  it('creates warm-introducer task when score_computed referralPersona is warm-introducer', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{ full_name: 'Nora Node' }]));
    mockQuery.mockReturnValueOnce(mockRows([]));
    mockQuery.mockReturnValueOnce(mockRows([]));

    const imp = baseImpulse({
      impulseType: 'score_computed',
      payload: { referralPersona: 'warm-introducer' },
    });
    const result = await executeTaskGenerator(imp, {});
    expect(result.tasksCreated).toBe(1);
  });

  it('creates ENGAGE_CONTENT task when behavioralPersona=super-connector', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{ full_name: 'Super C.' }]));
    mockQuery.mockReturnValueOnce(mockRows([])); // no existing
    mockQuery.mockReturnValueOnce(mockRows([])); // insert

    const imp = baseImpulse({
      impulseType: 'score_computed',
      payload: { behavioralPersona: 'super-connector' },
    });
    const result = await executeTaskGenerator(imp, {});
    expect(result.tasksCreated).toBe(1);
    const insertCall = mockQuery.mock.calls[2];
    const params = insertCall[1] as unknown[];
    expect(params[2]).toBe('ENGAGE_CONTENT');
  });

  it('returns no_matching_rules when impulse type has no task rules', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{ full_name: 'x' }]));

    const imp = baseImpulse({ impulseType: 'contact_created', payload: {} });
    const result = await executeTaskGenerator(imp, {});
    expect(result).toEqual({ tasksCreated: 0, reason: 'no_matching_rules' });
  });

  it('uses "Unknown Contact" placeholder when name lookup returns nothing', async () => {
    mockQuery.mockReturnValueOnce(mockRows([])); // no name
    mockQuery.mockReturnValueOnce(mockRows([])); // no existing
    mockQuery.mockReturnValueOnce(mockRows([])); // insert

    const result = await executeTaskGenerator(baseImpulse(), {});
    expect(result.tasksCreated).toBe(1);
    const insertCall = mockQuery.mock.calls[2];
    const params = insertCall[1] as unknown[];
    expect(String(params[0])).toContain('Unknown Contact');
  });
});
