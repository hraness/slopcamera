/**
 * SlopCamera's surfaces for the launch film: a coding-agent session, the
 * diagram source, the rendered diagram and the delivery cuts. The diagram is
 * drawn from the committed `source-to-film` fixtures, and every count comes
 * from the site's launch facts module, so the film shows what the product
 * actually writes.
 *
 * Illustration only: the agent chrome is generic and the session is made up.
 */
import type { ReactNode } from "react";
import { AgentSession, TerminalFrame } from "@hraness/design-kit/mockups";

import sourceDiagram from "../../apps/web/media/source-to-film-source-ad4ec8806384.json";
import revisedDiagram from "../../apps/web/media/source-to-film-revised-source-822a690049ca.json";
import { launchFacts } from "../../apps/web/src/launch-facts.ts";
import { workflowExamples } from "../../apps/web/src/example-registry.ts";

type Shape = { id: string; x: number; y: number; width: number; height: number; label: string; tone?: string };
type Edge = { id: string; from: string; to: string; startPosition?: number; endPosition?: number };
type Diagram = { canvas: { width: number; height: number }; shapes: Shape[]; edges: Edge[] };

const TONES: Record<string, string> = { blue: "#d9e6ff", purple: "#e6defc", green: "#d8f2df" };

/** The diagram, drawn from its JSON source. `revised` swaps in the one changed label. */
export function DiagramRender({ revised }: { revised: boolean }) {
  const diagram = (revised ? revisedDiagram : sourceDiagram) as Diagram;
  const byId = new Map(diagram.shapes.map(shape => [shape.id, shape]));
  return (
    <svg className="sc-diagram" viewBox={`0 0 ${diagram.canvas.width} ${diagram.canvas.height}`} aria-hidden="true">
      {diagram.edges.map(edge => {
        const from = byId.get(edge.from)!;
        const to = byId.get(edge.to)!;
        const x1 = from.x + from.width * (edge.startPosition ?? 0.5);
        const x2 = to.x + to.width * (edge.endPosition ?? 0.5);
        return <path className="sc-edge" d={`M${x1} ${from.y + from.height} C${x1} ${from.y + from.height + 80} ${x2} ${to.y - 80} ${x2} ${to.y - 12}`} key={edge.id} />;
      })}
      {diagram.shapes.map(shape => (
        <g data-film={shape.id === launchFacts.revision.id ? (revised ? "label-after" : "label-before") : undefined} key={shape.id}>
          <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={24} fill={TONES[shape.tone ?? "blue"] ?? "#eee"} className="sc-node" />
          <text x={shape.x + shape.width / 2} y={shape.y + shape.height / 2 + 12} textAnchor="middle" className="sc-node-label">{shape.label}</text>
        </g>
      ))}
    </svg>
  );
}

function Panel({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <section className="sc-panel" data-film={name}>
      <h3 className="sc-panel-title">{title}</h3>
      {children}
    </section>
  );
}

const outputs = workflowExamples.find(item => item.id === "source-to-film")!.downloads.filter(item => !item.file.endsWith(".json"));
const cuts = workflowExamples.filter(item => launchFacts.deliveryCuts.includes(item.id));

function ratio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  return `${width / d}:${height / d}`;
}

/** The studio: agent session, source, render and cuts, in one window. */
export function ProductMockup({ url }: { url?: string }) {
  void url;
  const { from, to } = launchFacts.revision;
  return (
    <div className="sc-studio" data-film-page="">
      <div className="sc-col">
        <div data-film="agent">
          <AgentSession
            agent="generic-cli"
            describe="Illustration of a coding agent asked for a pipeline diagram, running SlopCamera's diagram commands."
            theme="light"
            turns={[
              { role: "user", text: "Draw our source-to-film pipeline as a diagram. Light and dark, please." },
              { role: "agent", text: "I'll write it as a diagram source file and render it with SlopCamera." },
              { role: "tool", tool: "Write file", text: "source-to-film.diagram.json", status: "ok" },
              { role: "tool", tool: "Run", text: "slopcamera diagram render source-to-film.diagram.json", status: "ok", beat: "run" },
              { role: "agent", text: `Done. ${String(launchFacts.diagramOutputCount)} files, all from the one source.` },
            ]}
          />
        </div>
        <Panel name="outputs" title={`${String(launchFacts.diagramOutputCount)} files from one source`}>
          <ul className="sc-files">
            {outputs.map(item => <li key={item.file}><span className="sc-file-label">{item.label}</span><span className="sc-file-kb">{Math.round(item.bytes / 1024)} KB</span></li>)}
          </ul>
        </Panel>
      </div>
      <div className="sc-col">
        <Panel name="source" title="source-to-film.diagram.json">
          <pre className="sc-code">{`{
  "id": "${launchFacts.revision.id}",
  "type": "rect",
  "label": "`}<span className="sc-change" data-film="label">{from}</span><span className="sc-change-to">{to}</span>{`",
  "tone": "green"
}`}</pre>
        </Panel>
        <Panel name="render" title="Rendered diagram">
          <div className="sc-render">
            <div className="sc-render-before"><DiagramRender revised={false} /></div>
            <div className="sc-render-after"><DiagramRender revised={true} /></div>
          </div>
        </Panel>
        <Panel name="cuts" title="One edit, every shape">
          <ul className="sc-cuts">
            {cuts.map(item => {
              const video = item.video ?? item.poster;
              return (
                <li data-film={`cut-${item.id.replace("edit-directed-", "")}`} key={item.id}>
                  <span className="sc-cut-box" style={{ aspectRatio: `${video.width} / ${video.height}` }} />
                  <span className="sc-cut-ratio">{ratio(video.width, video.height)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/** A dark terminal card for the cold open: the usual one-shot result, with no recipe. */
export function OpenCard({ index }: { index: number }) {
  const lines = [
    ["image-final.png", "no prompt saved"],
    ["diagram-v2.png", "source unknown"],
    ["hero-FINAL-2.jpg", "which model?"],
    ["clip-square.mp4", "cut by hand"],
    ["figure.png", "size not recorded"],
    ["diagram-dark.png", "redrawn from scratch"],
  ] as const;
  const [file, note] = lines[index % lines.length]!;
  return (
    <TerminalFrame
      describe={`Illustration of a file called ${file} with no record of how it was made.`}
      lines={[{ kind: "input", text: `ls ${file}` }, { kind: "output", text: file }, { kind: "comment", text: note, tone: "muted" }]}
      theme="dark"
      title="Downloads"
    />
  );
}
