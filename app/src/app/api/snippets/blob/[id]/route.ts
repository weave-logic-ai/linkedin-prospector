// GET /api/snippets/blob/[id]
//
// Streams an image snippet blob back to the caller. Phase 1.5 uses this for
// the `/snippets` main-app panel's thumbnails and the full-size view. The
// route is tenant-scoped at the query level (see `getBlob` in blob-store.ts)
// — a blob owned by tenant A is invisible to tenant B, matching the row-
// level-security posture of the text-snippet path.
//
// This endpoint is NOT an extension endpoint (no X-Extension-Token). The
// main-app panel fetches it with the browser's normal cookie/session; the
// tenant resolver returns the default tenant which is the only tenant in
// v1 (see `03-snippet-editor.md` and tenant.ts). Future multi-tenant
// deployments should wrap this route in the main-app auth middleware and
// thread the session's tenant id through instead of `getDefaultTenantId`.
//
// Gated on `RESEARCH_FLAGS.snippets`.

import { NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { getDefaultTenantId } from '@/lib/snippets/tenant';
import { getBlob } from '@/lib/snippets/blob-store';

export const dynamic = 'force-dynamic';

// Cache for a week client-side. Blob id includes sha256 + uuid so the content
// is effectively immutable — a new upload of a different image gets a new
// row id. `immutable` lets the browser skip revalidation on subsequent views.
const CACHE_HEADER = 'private, max-age=604800, immutable';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!RESEARCH_FLAGS.snippets) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const { id } = await params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'blob id is required' },
      { status: 400 }
    );
  }
  // Basic UUID shape check — avoid wasted DB round-trips on obvious junk.
  if (!/^[0-9a-f-]{32,40}$/i.test(id)) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'blob id must be a UUID' },
      { status: 400 }
    );
  }

  try {
    const tenantId = await getDefaultTenantId();
    const blob = await getBlob(tenantId, id);
    if (!blob) {
      // Either absent OR owned by a different tenant — we do not distinguish
      // in the response (opaque-404), matching the RLS posture.
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    // Next's Response type accepts a Buffer directly. We set Content-Length
    // from the stored byte_length so the client can render a progress bar
    // on large downloads.
    return new NextResponse(blob.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': blob.mimeType,
        'Content-Length': String(blob.byteLength),
        'Cache-Control': CACHE_HEADER,
        // Hash-style ETag so intermediate caches can dedupe.
        ETag: `"${blob.sha256Hex}"`,
      },
    });
  } catch (err) {
    console.error('[Snippet blob] fetch failed:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: (err as Error).message },
      { status: 500 }
    );
  }
}
