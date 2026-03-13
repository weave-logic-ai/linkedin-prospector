import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { ContactTier, ReferralTier, BehavioralPersona } from "@/types/contact";

// ---------------------------------------------------------------------------
// Tailwind class merge helper
// ---------------------------------------------------------------------------

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Tier display utilities
// ---------------------------------------------------------------------------

/** CSS classes for tier badge backgrounds */
export const TIER_COLORS: Record<ContactTier, string> = {
  gold: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  silver: "bg-slate-400/15 text-slate-600 dark:text-slate-300 border-slate-400/30",
  bronze: "bg-orange-700/15 text-orange-700 dark:text-orange-400 border-orange-700/30",
  watch: "bg-gray-400/15 text-gray-500 dark:text-gray-400 border-gray-400/30",
};

/** Solid color hex values for charts */
export const TIER_HEX: Record<ContactTier, string> = {
  gold: "#eab308",
  silver: "#94a3b8",
  bronze: "#c2410c",
  watch: "#6b7280",
};

export function getTierColor(tier: ContactTier | string): string {
  return TIER_COLORS[tier as ContactTier] ?? TIER_COLORS.watch;
}

export function getTierHex(tier: ContactTier | string): string {
  return TIER_HEX[tier as ContactTier] ?? TIER_HEX.watch;
}

/** Capitalize tier for display */
export function tierLabel(tier: ContactTier | string): string {
  if (!tier) return "Watch";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// ---------------------------------------------------------------------------
// Score formatting
// ---------------------------------------------------------------------------

/** Format a 0-1 score as a percentage string (e.g. "73%") */
export function scorePercent(score: number | null | undefined): string {
  if (score == null) return "--";
  return `${Math.round(score * 100)}%`;
}

/** Format a 0-1 score with 2 decimal places (e.g. "0.73") */
export function scoreDecimal(score: number | null | undefined): string {
  if (score == null) return "--";
  return score.toFixed(2);
}

/** Map a 0-1 score to a color class for visual indicators */
export function scoreColorClass(score: number | null | undefined): string {
  if (score == null) return "text-gray-400";
  if (score >= 0.7) return "text-green-600 dark:text-green-400";
  if (score >= 0.4) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// ---------------------------------------------------------------------------
// URL / slug utilities
// ---------------------------------------------------------------------------

/**
 * Extract the LinkedIn username slug from a profile URL.
 * e.g. "https://www.linkedin.com/in/johndoe/" -> "johndoe"
 */
export function extractSlug(profileUrl: string): string {
  if (!profileUrl) return "";
  const match = profileUrl.match(/\/in\/([^/?#]+)/);
  return match ? match[1].replace(/\/$/, "") : "";
}

/**
 * Build a LinkedIn profile URL from a slug.
 * e.g. "johndoe" -> "https://www.linkedin.com/in/johndoe"
 */
export function slugToUrl(slug: string): string {
  if (!slug) return "";
  return `https://www.linkedin.com/in/${slug}`;
}

/**
 * Normalize a profile URL to a canonical form (lowercase, no trailing slash).
 * Used as the ID key in both RVF and graph.json.
 */
export function normalizeProfileUrl(url: string): string {
  if (!url) return "";
  let normalized = url.toLowerCase().trim();
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Persona display
// ---------------------------------------------------------------------------

const BEHAVIORAL_PERSONA_LABELS: Record<BehavioralPersona, string> = {
  "super-connector": "Super Connector",
  "content-creator": "Content Creator",
  "silent-influencer": "Silent Influencer",
  "rising-connector": "Rising Connector",
  "data-insufficient": "Data Insufficient",
  "passive-network": "Passive Network",
};

export function behavioralPersonaLabel(persona: BehavioralPersona | string): string {
  return BEHAVIORAL_PERSONA_LABELS[persona as BehavioralPersona] ?? persona ?? "--";
}

const REFERRAL_TIER_LABELS: Record<string, string> = {
  "gold-referral": "Gold Referral",
  "silver-referral": "Silver Referral",
  "bronze-referral": "Bronze Referral",
  "": "None",
};

export function referralTierLabel(tier: ReferralTier | string): string {
  return REFERRAL_TIER_LABELS[tier] ?? tier ?? "--";
}

// ---------------------------------------------------------------------------
// Date / time
// ---------------------------------------------------------------------------

/** Format an ISO timestamp to a human-readable short date */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "--";
  }
}

/** How long ago was this ISO date? Returns e.g. "3d ago", "2h ago" */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "--";
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo ago`;
    const yr = Math.floor(mo / 12);
    return `${yr}y ago`;
  } catch {
    return "--";
  }
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/** Format a number with commas (e.g. 5289 -> "5,289") */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "--";
  return n.toLocaleString("en-US");
}

/** Clamp a number to [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
