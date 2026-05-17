// Pure types + rule evaluation. No "use server" — safe to import anywhere.

export type SmartRules = {
  /** Track must have ANY of these tag IDs. */
  includeTagIds?: number[];
  /** Track must have NONE of these tag IDs. */
  excludeTagIds?: number[];
  /** Track must have ANY artist with one of these genres. */
  includeGenres?: string[];
  /** Track must have NO artist with any of these genres. */
  excludeGenres?: string[];
  /** ISO date — tracks added on/after this. */
  addedAfter?: string;
  /** ISO date — tracks added before this. */
  addedBefore?: string;
  /** Max number of tracks. */
  limit?: number;
  sortBy?: "added_desc" | "added_asc" | "random";
};

export type EvalTrack = {
  uri: string;
  artists: { id: string }[];
  added_at: string;
};

export type EvalContext = {
  /** Track URIs and the tag IDs applied to each. */
  tagsByUri: Record<string, number[]>;
  /** Artist IDs and their genres. */
  genresByArtistId: Record<string, string[]>;
};

/**
 * Filters and sorts tracks according to rules. Pure function — given the
 * same inputs always returns the same output. No I/O.
 */
export function evaluateRules<T extends EvalTrack>(
  tracks: T[],
  rules: SmartRules,
  ctx: EvalContext,
): T[] {
  let result = tracks.filter((t) => matches(t, rules, ctx));

  switch (rules.sortBy) {
    case "added_asc":
      result = [...result].sort(
        (a, b) => parseDate(a.added_at) - parseDate(b.added_at),
      );
      break;
    case "random": {
      const shuffled = [...result];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      result = shuffled;
      break;
    }
    case "added_desc":
    default:
      result = [...result].sort(
        (a, b) => parseDate(b.added_at) - parseDate(a.added_at),
      );
  }

  if (rules.limit && rules.limit > 0) {
    result = result.slice(0, rules.limit);
  }
  return result;
}

function matches<T extends EvalTrack>(
  t: T,
  rules: SmartRules,
  ctx: EvalContext,
): boolean {
  // Tag inclusion (any-of)
  const trackTagIds = ctx.tagsByUri[t.uri] ?? [];
  if (rules.includeTagIds && rules.includeTagIds.length > 0) {
    let found = false;
    for (const id of rules.includeTagIds) {
      if (trackTagIds.includes(id)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }

  // Tag exclusion
  if (rules.excludeTagIds && rules.excludeTagIds.length > 0) {
    for (const id of rules.excludeTagIds) {
      if (trackTagIds.includes(id)) return false;
    }
  }

  // Compute the union of all artists' genres for this track once.
  let trackGenres: Set<string> | null = null;
  const needsGenres =
    (rules.includeGenres && rules.includeGenres.length > 0) ||
    (rules.excludeGenres && rules.excludeGenres.length > 0);
  if (needsGenres) {
    trackGenres = new Set();
    for (const a of t.artists) {
      for (const g of ctx.genresByArtistId[a.id] ?? []) {
        trackGenres.add(g);
      }
    }
  }

  if (rules.includeGenres && rules.includeGenres.length > 0) {
    let found = false;
    for (const g of rules.includeGenres) {
      if (trackGenres!.has(g)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }

  if (rules.excludeGenres && rules.excludeGenres.length > 0) {
    for (const g of rules.excludeGenres) {
      if (trackGenres!.has(g)) return false;
    }
  }

  // Date range
  if (rules.addedAfter) {
    if (parseDate(t.added_at) < parseDate(rules.addedAfter)) return false;
  }
  if (rules.addedBefore) {
    if (parseDate(t.added_at) >= parseDate(rules.addedBefore)) return false;
  }

  return true;
}

function parseDate(s: string): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}
