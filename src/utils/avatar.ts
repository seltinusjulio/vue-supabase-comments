// First character of a word, keeping characters outside the basic plane whole.
const firstCharacter = (word: string) => word.replace(/^(.)[\s\S]*$/u, "$1");

/**
 * Up to two uppercase initials from a display name: the first letter of the
 * first and of the last word ("Budi Santoso" -> "BS", "budi" -> "B").
 */
export function getInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return words
    .filter(
      (_, index) =>
        index === 0 || (words.length > 1 && index === words.length - 1),
    )
    .map(firstCharacter)
    .join("")
    .toUpperCase();
}

/** A stable palette index for a name, so a person always gets the same color. */
export function getAvatarColorIndex(
  name: string | null | undefined,
  size: number,
): number {
  if (size <= 0) return 0;
  const normalized = (name ?? "").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return hash % size;
}
