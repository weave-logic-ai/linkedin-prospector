// GET /api/parser/yield-report — read path for the /admin/parsers page.
//
// Returns aggregated yield rows (7d default window, override with ?windowDays=).
// When RESEARCH_PARSER_TELEMETRY is off, returns { flagEnabled: false } and the
// admin UI renders the "telemetry disabled" banner.

import { NextResponse, type NextRequest } from 'next/server';
import { readYieldReport } from '@/lib/parser/telemetry';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const windowDays = Math.max(1, Math.min(90, Number(searchParams.get('windowDays') ?? '7') || 7));

  if (!RESEARCH_FLAGS.parserTelemetry) {
    return NextResponse.json({
      flagEnabled: false,
      windowDays,
      rows: [],
      message:
        'Parser telemetry is disabled. Set RESEARCH_PARSER_TELEMETRY=true in the environment to populate this view.',
    });
  }

  const rows = await readYieldReport({ windowDays });
  return NextResponse.json({
    flagEnabled: true,
    windowDays,
    rows: rows ?? [],
  });
}
