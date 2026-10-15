/**
 * A readable message from any thrown value: Error instances, message-shaped
 * objects (e.g. Supabase/PostgREST errors) and strings.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === "string") return error || fallback;
  if (
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message || fallback;
  }
  return fallback;
}
