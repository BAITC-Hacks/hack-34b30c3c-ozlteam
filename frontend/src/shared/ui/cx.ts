/** Склейка имён классов: пустые, false и undefined отбрасываются. */
export function cx(
  ...parts: ReadonlyArray<string | false | null | undefined>
): string {
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}
