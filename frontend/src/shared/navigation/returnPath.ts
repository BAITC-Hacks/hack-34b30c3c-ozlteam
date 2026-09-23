/** Validate per-entry navigation context, including search and hash. */
export function returnPath(
  value: unknown,
  fallback: string,
  allowedPaths: readonly string[],
): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return fallback;
  try {
    const parsed = new URL(value, window.location.origin);
    if (
      parsed.origin !== window.location.origin ||
      !allowedPaths.includes(parsed.pathname)
    )
      return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
