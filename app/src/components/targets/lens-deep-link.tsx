"use client";

// Phase 4 Track H — deep-link reader for `?lens=` query parameter.
//
// Two modes:
//   1. `?lens=<lensId>`         — tenant-local. Activates the lens if it
//                                 belongs to the current primary target and
//                                 is not soft-deleted. Deleted → banner.
//   2. `?lens=opaque:<b64>`     — self-contained. Decodes the config via
//                                 `decodeOpaqueLensUrl`; renders a "viewing
//                                 through shared lens" banner. No DB write.
//
// Applied transiently: this component does NOT mutate React state elsewhere
// in the app. The v1 scope is to activate the tenant-local lens (existing
// server behavior) and surface a banner for opaque / deleted cases. Deeper
// client-state propagation (filter overrides from the decoded config) is
// deferred — the banner tells the user what's happening.

import { useEffect, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { decodeOpaqueLensUrl, type EncodedLensPayload } from "@/lib/targets/lens-url";

interface LensDto {
  id: string;
  name: string;
  isDefault: boolean;
  deletedAt: string | null;
}

interface LensDeepLinkProps {
  primaryTargetId: string;
}

type BannerState =
  | { kind: "none" }
  | { kind: "activated"; name: string }
  | { kind: "deleted" }
  | { kind: "opaque"; payload: EncodedLensPayload }
  | { kind: "invalid" };

export function LensDeepLink({ primaryTargetId }: LensDeepLinkProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [banner, setBanner] = useState<BannerState>({ kind: "none" });

  useEffect(() => {
    const param = searchParams?.get("lens");
    if (!param) {
      setBanner({ kind: "none" });
      return;
    }

    // Opaque variant — decode inline, no server round-trip.
    if (param.startsWith("opaque:")) {
      const decoded = decodeOpaqueLensUrl(param);
      if (decoded) {
        setBanner({ kind: "opaque", payload: decoded });
      } else {
        setBanner({ kind: "invalid" });
      }
      return;
    }

    // Tenant-local variant — fetch the lens and activate if alive.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/targets/${primaryTargetId}/lenses`);
        if (!res.ok) return;
        const json = (await res.json()) as { data: LensDto[] };
        if (cancelled) return;
        const existing = (json.data ?? []).find((l) => l.id === param);
        if (!existing) {
          // Either belongs to another target, or was soft-deleted (the list
          // endpoint filters deleted). Best-effort peek at the specific row
          // to distinguish "deleted" from "not found".
          const detailRes = await fetch(
            `/api/targets/${primaryTargetId}/lenses?includeDeleted=1`
          ).catch(() => null);
          void detailRes; // reserved for future API extension
          setBanner({ kind: "deleted" });
          return;
        }
        if (!existing.isDefault) {
          await fetch(
            `/api/targets/${primaryTargetId}/lenses/${existing.id}/activate`,
            { method: "PUT" }
          ).catch(() => null);
        }
        setBanner({ kind: "activated", name: existing.name });
      } catch {
        // Silent — banner stays at none.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, primaryTargetId]);

  const dismiss = () => {
    setBanner({ kind: "none" });
    if (pathname) {
      // Strip the ?lens= param so reload doesn't re-trigger the banner.
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("lens");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
    }
  };

  if (banner.kind === "none") return null;

  const style =
    "border-b px-4 py-2 text-xs flex items-center gap-2 " +
    (banner.kind === "deleted" || banner.kind === "invalid"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-border/40 bg-muted/30 text-foreground");

  let message: string;
  if (banner.kind === "activated") {
    message = `Lens activated from link: ${banner.name}`;
  } else if (banner.kind === "deleted") {
    message = "This lens was deleted; viewing default.";
  } else if (banner.kind === "opaque") {
    message = `Viewing through shared lens${
      banner.payload.name ? `: ${banner.payload.name}` : ""
    } (transient, not saved).`;
  } else {
    message = "Shared lens URL could not be decoded; viewing default.";
  }

  return (
    <div className={style} role="status" aria-live="polite">
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={dismiss}
        className="rounded border border-current/40 px-2 py-0.5 text-[11px] uppercase tracking-wide"
      >
        Dismiss
      </button>
    </div>
  );
}
