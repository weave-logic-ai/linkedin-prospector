// Canonical entity projections — WS-2 Phase 2 Track D.
// Per `02-visibility-and-feedback.md` §§3.3, 4.2 and `08-phased-delivery.md`
// §4.1. Projections normalize the relational model into a flat shape the
// diff engine can compare across captures without reaching into joins.

/**
 * Per WS-2 diff spec: contacts project to `{fullName, headline,
 * currentCompany, title, email, location}`. (The spec's extended projection
 * including experience/education/skills belongs to WS-4; here we scope to
 * the six flat fields called out in the acceptance checklist.)
 */
export interface ContactProjection {
  fullName: string | null;
  headline: string | null;
  currentCompany: string | null;
  title: string | null;
  email: string | null;
  location: string | null;
}

/**
 * Per WS-2 diff spec: companies project to `{name, industry, sizeRange,
 * headquarters, employeeCount}`.
 */
export interface CompanyProjection {
  name: string | null;
  industry: string | null;
  sizeRange: string | null;
  headquarters: string | null;
  employeeCount: number | null;
}

export type EntityKind = 'contact' | 'company';

export type Projection = ContactProjection | CompanyProjection;

/** One change between two projections. */
export interface ProjectionDiffChange {
  field: string;
  kind: 'added' | 'removed' | 'changed';
  before: unknown;
  after: unknown;
}

export interface ProjectionDiff {
  entityKind: EntityKind;
  entityId: string;
  fromCaptureId: string | null;
  toCaptureId: string;
  changes: ProjectionDiffChange[];
  unchangedFieldCount: number;
}
