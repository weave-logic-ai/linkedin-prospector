// WS-4 §3.2 — graph shift-click helpers.
//
// Lives in its own module so the component file stays a "use client"
// bundle while these pure helpers can be imported from tests without
// dragging React or the sigma runtime along. The sigma-graph component
// imports from here; tests import from here directly.

/**
 * Narrow a sigma node-click payload to "was the original event a shift
 * click?" — sigma delivers mouse + touch together, so we only recognise
 * MouseEvent and check the shift modifier.
 */
export function isShiftClick(
  event: { original?: MouseEvent | TouchEvent } | undefined
): boolean {
  const original = event?.original;
  if (!original) return false;
  // Use a structural check so environments without MouseEvent global
  // (e.g. Node-side tests) still work — we pass through the fields we
  // care about.
  const maybeMouse = original as { shiftKey?: boolean; type?: string };
  return Boolean(maybeMouse.shiftKey);
}

/**
 * POST /api/targets with `{kind: 'contact', id}` to get-or-create the
 * target row, then PUT /api/targets/state with `secondaryTargetId`. Silent
 * on failure — the breadcrumb UI polls state on a timer so a missed write
 * self-heals on the next render.
 *
 * Exported so the graph component and its tests both use the same flow.
 */
export async function setSecondaryTargetViaShiftClick(
  contactId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; secondaryTargetId?: string }> {
  try {
    const createRes = await fetchImpl("/api/targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "contact", id: contactId }),
    });
    if (!createRes.ok) return { ok: false };
    const createJson = (await createRes.json()) as { data: { id: string } };
    const putRes = await fetchImpl("/api/targets/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secondaryTargetId: createJson.data.id }),
    });
    if (!putRes.ok) return { ok: false, secondaryTargetId: createJson.data.id };
    return { ok: true, secondaryTargetId: createJson.data.id };
  } catch {
    return { ok: false };
  }
}
