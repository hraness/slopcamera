import type { OpClass } from "@hraness/desktop-foundation/registry";

/**
 * Every Slopcamera verb with its operation class, for `slopcamera commands
 * --json`. The first three columns are the verb path, its class and a
 * one-line summary. `read` verbs change nothing; `operate` verbs write
 * local files, spend credits an agent was already allowed to spend, or open
 * a window; `decide-legacy` marks a decision a person should own that the
 * CLI still lets an agent make, kept so current workflows keep working
 * (plan Q4). Nothing in Slopcamera is a gated `decide` verb today.
 *
 * `registry.test.ts` checks this table against the CLI's completion tree,
 * so a new command cannot ship without a class.
 */
export interface VerbRow {
  readonly path: readonly string[];
  readonly opClass: OpClass;
  readonly summary: string;
}

const row = (words: string, opClass: OpClass, summary: string): VerbRow => ({ path: words.split(" "), opClass, summary });

export const CLI_VERBS: readonly VerbRow[] = [
  row("update", "operate", "Install a verified newer CLI release"),
  row("update check", "operate", "Check release availability and save the check time"),
  row("update status", "read", "Show installation support and update preferences"),
  row("update enable", "operate", "Enable automatic CLI updates"),
  row("update disable", "operate", "Keep the installed CLI version"),
  row("capabilities", "read", "List what this build can do and how well each part is tested"),
  row("doctor", "read", "Check local render tools, asset caches and old login items"),
  row("operations list", "read", "List the operations agents can run and their limits"),
  row("operations show", "read", "Show one operation's contract"),

  row("diagram init", "operate", "Write a new portable diagram source"),
  row("diagram check", "read", "Validate a diagram source"),
  row("diagram render", "operate", "Render a diagram to an image"),
  row("diagram sheets init", "operate", "Write a new drawing-sheet source"),
  row("diagram sheets check", "read", "Validate a drawing-sheet source"),
  row("diagram sheets render", "operate", "Render drawing sheets"),

  row("scene init", "operate", "Write a new directed 3D scene source"),
  row("scene check", "read", "Validate a scene source"),
  row("scene inspect", "read", "Summarize a scene source"),
  row("scene diff", "read", "Compare two scene sources"),
  row("scene patch", "operate", "Apply a patch and write a new scene"),
  row("scene evaluate", "read", "Evaluate a camera at one time"),
  row("scene audit", "read", "Audit framing and bounds for a camera"),
  row("scene render-audit", "operate", "Render sample frames and audit them"),
  row("scene solve", "operate", "Solve camera goals into a patch"),
  row("scene review", "operate", "Send sample frames for a cloud visual review"),
  row("scene camera-track", "operate", "Sample a camera track into a new file"),
  row("scene generate", "operate", "Run a scene generator module"),
  row("scene plan", "read", "Plan a scene render without rendering"),
  row("scene render", "operate", "Render a scene"),
  row("scene temporal-audit", "read", "Audit a scene over time"),
  row("scene direction check", "read", "Validate a direction file"),
  row("scene direction plan", "operate", "Plan shots from a direction file"),
  row("scene direction gallery", "operate", "Render a gallery across one direction axis"),
  row("scene effects check", "read", "Validate an effects file"),
  row("scene effects plan", "operate", "Plan effects from a draft"),
  row("scene effects bake", "operate", "Bake effects into a scene"),
  row("scene behavior check", "read", "Validate a behavior file"),
  row("scene behavior bake", "operate", "Bake behaviors into a scene"),
  row("scene behavior gallery", "operate", "Render a behavior gallery"),
  row("scene behavior audit", "read", "Audit baked behaviors"),
  row("scene design catalog", "read", "List parametric design templates"),
  row("scene design init", "operate", "Write a new parametric design"),
  row("scene design inspect", "read", "Summarize a parametric design"),
  row("scene design set", "operate", "Write a design with new parameters"),
  row("scene design compile", "operate", "Compile a design into scene geometry"),
  row("scene design gallery", "operate", "Render a gallery of design variants"),

  row("direct init", "operate", "Write a new directing recipe"),
  row("direct anchor", "operate", "Import one local image or video as a source reference"),
  row("direct plan", "read", "Check Gateway capabilities and prices for a recipe"),
  row("direct start", "operate", "Start a directed clip with a fixed budget"),
  row("direct inspect", "read", "Show a directed clip's takes and budget"),
  row("direct revise", "operate", "Revise a directed clip's recipe"),
  row("direct generate", "operate", "Generate one paid take"),
  row("direct resume", "operate", "Resume an interrupted take"),
  row("direct review", "operate", "Record a review of one take"),
  row("direct assemble", "operate", "Assemble accepted takes into a clip"),
  row("direct cleanup", "operate", "Delete a take's temporary hosted references"),

  row("studio init", "operate", "Write a new native studio source bundle"),
  row("studio bundle", "operate", "Retain a studio source bundle"),
  row("studio plan", "read", "Plan a studio job without running it"),
  row("studio probe", "read", "Load the chosen engine and check the job"),
  row("studio run", "operate", "Run trusted Blender, CAD or Manim source"),
  row("studio encode", "operate", "Encode a rendered sequence"),
  row("studio asset", "operate", "Export one studio asset"),
  row("studio assemble", "operate", "Assemble a studio output"),
  row("studio inspect", "read", "Show a studio run and its receipts"),
  row("studio reconcile", "operate", "Restore a missing receipt after a closed run"),
  row("studio assets search", "read", "Search Poly Haven assets"),
  row("studio assets describe", "read", "Describe one Poly Haven asset"),
  row("studio assets plan", "read", "Plan an asset import"),
  row("studio assets import", "operate", "Import planned assets"),

  row("image vectorize", "operate", "Trace a raster image into an SVG"),
  row("image generate", "operate", "Generate an image with Vercel AI Gateway"),
  row("image gallery", "operate", "Generate a review gallery of image candidates"),
  row("image icon", "operate", "Generate a line-art SVG icon"),
  row("image icon compose", "operate", "Solve a vector icon scene and report its digests"),
  row("image icon render", "operate", "Draw a vector icon scene or recipe to inert SVG"),

  row("html catalog", "read", "List HTML scene profiles"),
  row("html scaffold", "operate", "Write a new HTML scene"),
  row("html init", "operate", "Start an HTML film from a template"),
  row("html render", "operate", "Render an HTML scene to video"),
  row("html still", "operate", "Render frames of an HTML scene as images"),
  row("html preview", "operate", "Render a contact sheet of an HTML scene"),
  row("html deliver", "operate", "Write the finished cuts, poster and social image for an HTML film"),

  row("style list", "read", "List visual styles"),
  row("style show", "read", "Show one visual style"),

  row("workflows list", "read", "List reviewed workflows"),
  row("workflows show", "read", "Show one workflow"),
  row("workflows plan", "read", "Plan a workflow run"),
  row("workflows run", "operate", "Run a workflow"),

  row("code init", "operate", "Write a new TypeScript workflow"),
  row("code check", "read", "Preflight a TypeScript workflow"),
  row("code plan", "read", "Plan a TypeScript workflow run"),
  row("code run", "operate", "Run a trusted TypeScript workflow"),

  row("runs list", "read", "List durable workflow runs"),
  row("runs show", "read", "Show one run"),
  row("runs resume", "operate", "Resume a run"),
  row("runs approve", "decide-legacy", "Approve a paused run step; kept open to agents for now"),
  row("runs cancel", "operate", "Ask a run to stop"),

  row("ai models", "read", "List or show Vercel AI Gateway media models"),
  row("ai provider-options", "read", "Inspect a provider options file"),
  row("ai image", "operate", "Generate images or a gallery with Gateway"),
  row("ai video", "operate", "Generate video with Gateway"),
  row("ai speech", "operate", "Generate speech with Gateway"),
  row("ai transcribe", "operate", "Transcribe audio with Gateway"),

  row("credits status", "read", "Show the credits balance"),
  row("credits topup", "operate", "Print a checkout link a person pays at"),
  row("credits wait", "operate", "Wait for a payment and store the device token"),
  row("credits forget", "operate", "Remove the stored credits token; the balance stays"),

  row("media audio", "operate", "Apply audio effects into a new file"),
  row("media color", "operate", "Apply a color grade into a new file"),
  row("media soundtrack compose", "operate", "Verify a loop or song score"),
  row("media soundtrack grid", "operate", "Derive music timing and section cues from a score"),

  row("outputs", "read", "Print the outputs folder"),
  row("outputs list", "read", "List the files in the outputs folder, newest first"),
  row("outputs open", "operate", "Open the outputs folder in Finder"),
  row("outputs reveal", "operate", "Show one output in Finder"),

  row("recordings list", "read", "List recording bundles"),
  row("projects list", "read", "List projects"),
  row("projects create", "operate", "Create a project from a recording"),
  row("project inspect", "read", "Show a project's media and edits"),
  row("project add", "operate", "Add media to a project"),
  row("project edit", "operate", "Change a project's edits"),
  row("project render", "operate", "Plan or render a project"),
  row("project cinema init", "operate", "Write a new cinema sequence for a project"),
  row("project cinema check", "read", "Validate a project's cinema sequence"),
  row("project cinema plan", "operate", "Plan a cinema sequence and authorize its sidecar"),
  row("project cinema audit", "read", "Report pacing, transitions and shot metrics"),
  row("project cinema gallery", "operate", "Compile candidate plans along one axis"),
  row("project cinema animatic", "operate", "Render a quick animatic of the sequence"),
  row("project cinema run", "operate", "Render the cinema sequence"),
  row("align analyze", "read", "Find the audio offset between project clips"),
  row("align apply", "operate", "Apply an audio alignment"),
  row("fillers list", "read", "List filler-word cuts"),
  row("fillers apply", "operate", "Apply filler-word cuts"),
  row("faces list", "read", "List face-geometry tracks"),
  row("inspect", "read", "Summarize a recording's tracks, segments, events and edits"),
  row("events", "read", "Query a recording's metadata events"),
  row("edit", "operate", "Add a non-destructive edit to a recording's plan"),
  row("analyze faces", "operate", "Track face geometry locally"),
  row("analyze inactivity", "operate", "Find and optionally cut inactivity"),
  row("analyze zooms", "operate", "Suggest and optionally apply zooms"),
  row("analyze music", "operate", "Analyze music structure"),
  row("analyze scenes", "operate", "Plan or run scene analysis"),
  row("analyze speech", "operate", "Transcribe speech locally and find fillers"),
  row("render plan", "read", "Resolve a render plan"),
  row("render run", "operate", "Render a recording"),
  row("assets emoji", "read", "Search or resolve local emoji overlays"),

  row("support", "read", "Show the links for updates and paid support"),
  row("support status", "read", "Show whether support invitations are on"),
  row("support dismiss", "operate", "Stop showing support invitations"),
  row("support snooze", "operate", "Hide support invitations for 30 days"),
  row("support enable", "operate", "Show support invitations again"),
  row("support protocol", "read", "Print the support protocol version for integrations"),
  row("support offer", "read", "Print an invitation for an integration to show"),
  row("support shown", "operate", "Record that an integration showed an invitation"),
  row("support release", "operate", "Release an invitation an integration did not show"),


  row("status", "read", "What Slopcamera is doing, credits, newest outputs and old login items"),
  row("tui", "read", "The status screen; --snapshot prints it once, --json prints the status"),
  row("legacy retire", "operate", "Stop the old menu bar opening at login, keeping its file"),
];
