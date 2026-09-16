# Privacy and local data

`@hraness/slopcamera` is a local-first media authoring toolkit for work that the
operator owns or is authorized to record, import, edit, analyze, and publish.
This document describes the data it can capture, the local execution boundary,
and the selected media that can leave the machine.

Slopcamera imports finished recording bundles that can contain display video,
system audio, camera and microphone tracks, and interaction metadata such as
cursor positions, clicks, key activity, focused-input bounds, display topology,
and window snapshots. It reads that evidence locally and never records new
input itself.

Slopcamera can also read caller-selected local media and project files, invoke
bounded local browser and media subprocesses, analyze faces locally without
identifying them, and write recordings, derived media, metadata, previews, and
receipts below a caller-selected project. Its local MCP server and workflow
host expose fixed, typed operations to an authorized local agent. Explicitly
imported imperative workflow modules are trusted current-user Bun code rather
than sandboxed input.

Generation and model-backed media analysis can send an explicit prompt and
caller-selected media to Vercel AI Gateway. Local media upload requires the
matching command acknowledgement. Local vectorization, face detection,
ordinary media editing, and diagram rendering remain local. Slopcamera does
not provide an account service and does not upload a project to a Slopcamera
service.

Optional support notices are local. After useful command-line work, the
`slopcamera` executable can print a short discovery notice to stderr and, on
request, an optional support offer that names the shared Hraness support page.
Opening that page and any payment are explicit human choices in a browser. The notice preferences,
throttles, and last presentation are stored only in local JSON files under
`$XDG_STATE_HOME/hraness/support` (by default `~/.local/state/hraness/support`),
shared with other Hraness tools for the same user. No email address, task
output, or project data is collected or sent, and
`HRANESS_SUPPORT_AUDIENCE=off` disables the notices.

Use Slopcamera only on devices, accounts, displays, conversations, and media that you
are entitled and permitted to capture or process. Obtain any consent required
by law, contract, workplace policy, or platform rules. Do not use Slopcamera to
surveil another person, collect credentials, bypass operating-system
permissions or access controls, capture protected communications without
authorization, or publish private media without permission.

Screen recordings, camera and microphone media, system audio, cursor and input
events, typed text, window titles, focus state, project paths, model prompts,
and generated receipts can contain credentials, private communications,
personal data, or proprietary material. Review captured and derived artifacts
before committing, sharing, uploading, or publishing them. Keep Gateway
credentials in the process environment and remove secrets and private media
from vulnerability reports.

Report suspected vulnerabilities through GitHub private vulnerability
reporting at https://github.com/hraness/slopcamera/security/advisories/new.
