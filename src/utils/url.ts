/**
 * The URL when it is safe to put in a link: an absolute http(s) URL or a
 * same-site path. Anything else (javascript:, data:, vbscript:, ...) and
 * unparsable values give `undefined`, because attachment URLs come from the
 * backend and a comment author may have written an arbitrary value there.
 */
export function safeLinkUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  const value = url.trim();
  // A single leading slash is a same-site path; "//host" is protocol-relative.
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
}
