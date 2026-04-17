// EDGAR connector — pad/parse/extract unit tests.
//
// The network + DB path is covered by route tests; here we pin the pure
// helpers that do the heavy lifting.

import {
  padCik,
  parseSubmissions,
  primaryDocUrl,
  extract10KSections,
} from '@/lib/sources/connectors/edgar';

describe('sources/connectors/edgar', () => {
  describe('padCik', () => {
    it('pads short CIKs to 10 digits', () => {
      expect(padCik('320193')).toBe('0000320193'); // Apple
    });

    it('is a no-op when already 10 digits', () => {
      expect(padCik('0000320193')).toBe('0000320193');
    });

    it('strips non-numeric characters', () => {
      expect(padCik('CIK0000320193')).toBe('0000320193');
    });

    it('throws for empty input', () => {
      expect(() => padCik('')).toThrow(/Invalid CIK/);
    });
  });

  describe('parseSubmissions', () => {
    it('returns empty filings when no recent payload present', () => {
      const out = parseSubmissions({ cik: '320193', name: 'Apple Inc.' });
      expect(out.filings).toEqual([]);
      expect(out.name).toBe('Apple Inc.');
    });

    it('zips parallel arrays into EdgarFiling rows', () => {
      const body = {
        cik: '320193',
        name: 'Apple Inc.',
        filings: {
          recent: {
            accessionNumber: ['0001-24-001', '0001-24-002'],
            filingDate: ['2024-01-01', '2024-02-01'],
            reportDate: ['2023-12-31', ''],
            form: ['10-K', '10-Q'],
            primaryDocument: ['apple-10k.htm', 'apple-10q.htm'],
            primaryDocDescription: ['10-K', '10-Q'],
          },
        },
      };
      const out = parseSubmissions(body);
      expect(out.filings).toHaveLength(2);
      expect(out.filings[0].form).toBe('10-K');
      expect(out.filings[1].form).toBe('10-Q');
      expect(out.filings[0].reportDate).toBe('2023-12-31');
      expect(out.filings[1].reportDate).toBeNull();
    });

    it('throws on malformed body', () => {
      expect(() => parseSubmissions(null)).toThrow();
      expect(() => parseSubmissions('bad')).toThrow();
    });
  });

  describe('primaryDocUrl', () => {
    it('builds the archive URL with dashless accession + unpadded CIK', () => {
      const url = primaryDocUrl('0000320193', '0001193125-24-012345', 'apple.htm');
      expect(url).toBe(
        'https://www.sec.gov/Archives/edgar/data/320193/000119312524012345/apple.htm'
      );
    });
  });

  describe('extract10KSections', () => {
    it('pulls Item 1A and Item 10 sections from plain text', () => {
      const body = `
Item 1. Business
Our company does stuff.
Item 1A. Risk Factors
We face many risks including market competition, regulatory change, and supply chain issues.
Item 2. Properties
We own buildings.
Item 10. Directors, Executive Officers and Corporate Governance
Our executive officers include John Smith, CEO, and Jane Doe, CFO.
Item 11. Executive Compensation
Compensation details follow.
      `.trim();
      const out = extract10KSections(body);
      expect(out.riskFactors).toContain('Risk Factors');
      expect(out.riskFactors).toContain('market competition');
      expect(out.directorsOfficers).toContain('John Smith');
      expect(out.directorsOfficers).toContain('Jane Doe');
    });

    it('strips script / style tags before matching', () => {
      const body = `
<html><script>var x = 'Item 1A';</script>
<body>
<p>Item 1A. Risk Factors: our risks are minimal.</p>
<p>Item 2. Properties</p>
</body></html>
      `;
      const out = extract10KSections(body);
      expect(out.riskFactors).toContain('risks are minimal');
    });

    it('returns null when markers are absent', () => {
      const out = extract10KSections('Plain text with no SEC items.');
      expect(out.riskFactors).toBeNull();
      expect(out.directorsOfficers).toBeNull();
    });
  });
});
