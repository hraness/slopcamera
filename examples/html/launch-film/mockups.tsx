/**
 * Placeholder product surfaces for the film. Replace these with your site's
 * real mockup components (for example from @hraness/design-kit/mockups) and
 * keep the `data-film` names that film.json steps point at.
 *
 * Illustration only: names and text are made up.
 */
import type { ReactNode } from "react";

const people = ["Ada", "Ben", "Chen", "Dara", "Eli", "Fay"];
const requests = [
  "Update the pricing page footnote",
  "Export last month's report as CSV",
  "Add Chen to the design review",
  "Fix the broken link in onboarding",
  "Move the launch call to Thursday",
  "Check the new signup form on mobile",
];

function Row({ index, children }: { index: number; children: ReactNode }) {
  return (
    <li className="fm-row" data-film={`row-${index + 1}`}>
      <span className="fm-avatar" aria-hidden="true">{people[index % people.length]![0]}</span>
      <span className="fm-row-text">{children}</span>
      <span className="fm-row-meta">{people[index % people.length]}</span>
    </li>
  );
}

/** A browser frame around a simple requests app. */
export function ProductMockup({ url = "app.example.com" }: { url?: string }) {
  return (
    <div className="fm-browser" role="img" aria-label="Illustration of a requests list with one request open">
      <div className="fm-chrome">
        <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="fm-url">{url}</span>
      </div>
      <div className="fm-page" data-film-page="">
        <aside className="fm-side">
          <b>Requests</b>
          <span className="fm-side-on">Open</span>
          <span>Done</span>
          <span>Archived</span>
        </aside>
        <section className="fm-list" data-film="list">
          <h3 className="fm-h">Open requests</h3>
          <ol>{requests.map((text, index) => <Row index={index} key={text}>{text}</Row>)}</ol>
        </section>
        <section className="fm-detail" data-film="detail">
          {/* Focus a camera on this block, not the full-height panel, so the push-in keeps the heading. */}
          <div data-film="detail-body">
            <p className="fm-eyebrow">Request from Ben</p>
            <h3 className="fm-h">{requests[1]}</h3>
            <p className="fm-body">The finance team needs last month's numbers by Friday. A CSV is fine.</p>
            <button className="fm-button" data-film="action" type="button">Mark done</button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** A small card used in the cold open collage. */
export function OpenCard({ index }: { index: number }) {
  return (
    <div className="fm-card">
      <span className="fm-avatar" aria-hidden="true">{people[index % people.length]![0]}</span>
      <div>
        <b>{people[index % people.length]}</b>
        <p>{requests[index % requests.length]}</p>
      </div>
    </div>
  );
}
