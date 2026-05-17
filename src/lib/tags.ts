// Pure types/constants for tags. No "use server" — safe to import anywhere.

export const TAG_COLORS = [
  "acid",
  "amber",
  "coral",
  "sky",
  "violet",
  "rose",
  "mint",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export type Tag = {
  id: number;
  name: string;
  color: string;
  trackCount: number;
};

export const isValidTagColor = (c: string): c is TagColor =>
  (TAG_COLORS as readonly string[]).includes(c);
