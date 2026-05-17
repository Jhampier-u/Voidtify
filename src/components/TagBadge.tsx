import type { Tag } from "@/lib/tags";

const COLOR_VARS: Record<string, string> = {
  acid: "var(--color-tag-acid)",
  amber: "var(--color-tag-amber)",
  coral: "var(--color-tag-coral)",
  sky: "var(--color-tag-sky)",
  violet: "var(--color-tag-violet)",
  rose: "var(--color-tag-rose)",
  mint: "var(--color-tag-mint)",
};

export function tagColorVar(color: string): string {
  return COLOR_VARS[color] ?? COLOR_VARS.acid;
}

export default function TagBadge({
  tag,
  size = "sm",
  active,
  onClick,
}: {
  tag: Pick<Tag, "name" | "color">;
  size?: "xs" | "sm" | "md";
  active?: boolean;
  onClick?: () => void;
}) {
  const color = tagColorVar(tag.color);
  const sizeClass =
    size === "xs"
      ? "text-[9px] px-1 py-0 leading-4"
      : size === "md"
        ? "text-[11px] px-2 py-1"
        : "text-[10px] px-1.5 py-0.5 leading-4";

  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      type={onClick ? "button" : undefined}
      className={`label-mono ring-1 transition-colors normal-case tracking-normal ${sizeClass} ${
        onClick ? "cursor-pointer" : ""
      }`}
      style={{
        color: active ? "var(--color-ink)" : color,
        backgroundColor: active ? color : "transparent",
        borderColor: color,
      }}
    >
      {tag.name}
    </Tag>
  );
}
