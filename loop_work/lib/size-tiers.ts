// lib/dashboard/size-tiers.ts
//
// One function, used by the grid, that every widget's content-switching
// logic is built on. A widget never computes its own tier — it's handed
// one via props.size.tier and just renders accordingly.

import type { SizeTier, WidgetDefinition } from "./types";

export function getSizeTier(w: number, h: number, definition: WidgetDefinition): SizeTier {
  const { minSize, maxSize } = definition;

  // At (or clamped to) the floor react-grid-layout enforces — least content.
  if (w <= minSize.w && h <= minSize.h) return "compact";

  // At (or past) the ceiling — most content.
  if (w >= maxSize.w && h >= maxSize.h) return "expanded";

  // Anything in between renders the default view. This deliberately favours
  // fewer jumps over pixel-perfect proportionality — a widget that redraws
  // itself on every intermediate drag frame feels janky, not responsive.
  return "default";
}
