export function slopcameraUpdatePolicy(argv: readonly string[]): { effectFree: boolean; offline: boolean } {
  const [command, action] = argv;
  const portable = ["diagram", "mcp", "canvas", "skill"].includes(command ?? "")
    || (command === "style" && !argv.includes("--help") && !argv.includes("-h"))
    || (command === "code" && ["search", "execute"].includes(action ?? ""))
    || (command === "media" && action === "soundtrack")
    || (command === "image" && ["vectorize", "icon", "gallery"].includes(action ?? ""))
    || (command === "image" && action === "generate" && argv.includes("--output"));
  const registry = ["status", "tui", "commands", "outputs", "legacy", "support"].includes(command ?? "");
  return {
    effectFree: command === undefined || ["help", "--help", "-h", "version", "--version", "__complete", "capabilities"].includes(command)
      || (command === "diagram" && ["help", "--help", "-h"].includes(action ?? ""))
      || (!portable && !registry && (argv.includes("--help") || argv.includes("-h"))),
    offline: command === "diagram"
      || (command === "image" && ["vectorize", "icon"].includes(action ?? ""))
      || (command === "media" && action === "soundtrack"),
  };
}
