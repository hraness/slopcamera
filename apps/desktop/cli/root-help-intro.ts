const camera = "   __\n _|__|_\n|  (o) |\n|______|\n\n";

/** Decoration is confined to readable, interactive root help. */
export function rootHelpIntro(
  argv: readonly string[],
  terminal: Readonly<{ isTTY: boolean; term: string | undefined; columns: number | undefined }>,
): string {
  return terminal.isTTY && terminal.term !== "dumb"
    && terminal.columns !== undefined && Number.isFinite(terminal.columns) && terminal.columns >= 48
    && (argv.length === 0
      || argv.length === 1 && (argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h"))
    ? camera
    : "";
}
