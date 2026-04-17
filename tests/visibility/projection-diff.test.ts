// WS-2 Phase 2 Track D — projection diff correctness.
// Validates the semantic diff rules in `02-visibility-and-feedback.md` §§4.2, 8
// and `08-phased-delivery.md` §4.1.

import {
  diffProjections,
  buildProjectionDiff,
} from '@/lib/projections/diff';
import { projectContactRow } from '@/lib/projections/contact';
import { projectCompanyRow } from '@/lib/projections/company';
import type {
  ContactProjection,
  CompanyProjection,
} from '@/lib/projections/types';

const base: ContactProjection = {
  fullName: 'Jane Doe',
  headline: 'VP Eng',
  currentCompany: 'Acme',
  title: 'VP of Engineering',
  email: null,
  location: 'SF',
};

describe('projection diff — contact', () => {
  it('first capture (before = null) marks every non-empty field as added', () => {
    const { changes, unchangedFieldCount } = diffProjections<ContactProjection>(null, base);
    const kinds = new Set(changes.map((c) => c.kind));
    expect(kinds.size).toBe(1);
    expect(kinds.has('added')).toBe(true);
    // email is null so it must not appear in added; every other field does.
    expect(changes.map((c) => c.field).sort()).toEqual(
      ['currentCompany', 'fullName', 'headline', 'location', 'title'],
    );
    expect(unchangedFieldCount).toBe(1); // email: before null, after null
  });

  it('detects a simple value change (title drift)', () => {
    const after: ContactProjection = { ...base, title: 'Vice President, Engineering' };
    const { changes } = diffProjections(base, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      field: 'title',
      kind: 'changed',
      before: 'VP of Engineering',
      after: 'Vice President, Engineering',
    });
  });

  it('detects added + removed + changed in a single pass', () => {
    const after: ContactProjection = {
      ...base,
      email: 'jane@acme.com', // added
      location: null,         // removed
      title: 'CTO',           // changed
    };
    const { changes } = diffProjections(base, after);
    const byField = new Map(changes.map((c) => [c.field, c.kind]));
    expect(byField.get('email')).toBe('added');
    expect(byField.get('location')).toBe('removed');
    expect(byField.get('title')).toBe('changed');
    // Ordering per WS-2 §8: added > removed > changed, alpha within each kind.
    expect(changes.map((c) => c.kind)).toEqual(['added', 'removed', 'changed']);
  });

  it('treats empty string as absent — no spurious change', () => {
    const before: ContactProjection = { ...base, email: '' as unknown as string };
    const after: ContactProjection = { ...base, email: null };
    const { changes, unchangedFieldCount } = diffProjections(before, after);
    expect(changes).toHaveLength(0);
    expect(unchangedFieldCount).toBe(6);
  });

  it('buildProjectionDiff tags entity metadata on the result', () => {
    const diff = buildProjectionDiff({
      entityKind: 'contact',
      entityId: '11111111-1111-1111-1111-111111111111',
      fromCaptureId: 'abc',
      toCaptureId: 'def',
      before: base,
      after: { ...base, title: 'New Title' },
    });
    expect(diff.entityKind).toBe('contact');
    expect(diff.fromCaptureId).toBe('abc');
    expect(diff.toCaptureId).toBe('def');
    expect(diff.changes[0].kind).toBe('changed');
  });
});

describe('projection diff — company', () => {
  const before: CompanyProjection = {
    name: 'Acme Inc',
    industry: 'Software',
    sizeRange: '201-500',
    headquarters: 'SF',
    employeeCount: 250,
  };
  it('detects numeric employeeCount changes as "changed"', () => {
    const after: CompanyProjection = { ...before, employeeCount: 400 };
    const { changes } = diffProjections(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('changed');
    expect(changes[0].before).toBe(250);
    expect(changes[0].after).toBe(400);
  });

  it('employeeCount=0 is NOT treated as absent', () => {
    // 0 is a real value; isEmpty only covers null/undefined/''.
    const after: CompanyProjection = { ...before, employeeCount: 0 };
    const { changes } = diffProjections(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('changed');
    expect(changes[0].after).toBe(0);
  });
});

describe('projection assemblers', () => {
  it('projectContactRow prefers full_name over first+last', () => {
    const p = projectContactRow({
      id: 'x',
      full_name: 'Jane Doe',
      first_name: 'Wrong',
      last_name: 'Name',
      headline: null,
      title: null,
      current_company: null,
      email: null,
      location: null,
    });
    expect(p.fullName).toBe('Jane Doe');
  });

  it('projectContactRow falls back to first+last when full_name is blank', () => {
    const p = projectContactRow({
      id: 'x',
      full_name: '  ',
      first_name: 'Jane',
      last_name: 'Doe',
      headline: null,
      title: null,
      current_company: null,
      email: null,
      location: null,
    });
    expect(p.fullName).toBe('Jane Doe');
  });

  it('projectCompanyRow coerces employee_count to number | null', () => {
    const p = projectCompanyRow({
      id: 'x',
      name: 'Acme',
      industry: null,
      size_range: null,
      headquarters: null,
      employee_count: '400' as unknown as number,
    });
    expect(p.employeeCount).toBe(400);

    const p2 = projectCompanyRow({
      id: 'x',
      name: 'Acme',
      industry: null,
      size_range: null,
      headquarters: null,
      employee_count: null,
    });
    expect(p2.employeeCount).toBeNull();
  });
});
