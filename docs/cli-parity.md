# CLI parity with the retired menu bar

Slopcamera had an optional macOS menu-bar companion until the menu-bar retirement. Everything it showed or did is a command now, and every command also takes `--json`. `apps/desktop/cli/status-goldens.test.ts` fails if a row here stops matching a registered command, and it keeps a `tui --snapshot` golden at widths 40, 80 and 120 plus a `status --json` golden for every state the menu had.

| Menu action | Command | Notes |
| --- | --- | --- |
| `status row (activity)` | `slopcamera status` | What is running or how the last job ended. `slopcamera tui` keeps it on screen. |
| `status row (credits)` | `slopcamera status` | Last known balance and whether it is low; `slopcamera credits status` checks it live. |
| `outputs.open.<file>` | `slopcamera outputs open <name>` | Names come from `slopcamera outputs list`. macOS only. |
| `outputs.reveal.<file>` | `slopcamera outputs reveal <name>` | Shows the file in Finder. macOS only. |
| `outputs.folder` | `slopcamera outputs open` | With no name, opens the outputs folder. `slopcamera outputs` prints its path. |
| `login` | `slopcamera legacy retire` | Nothing opens at login any more. This moves an old login item aside; it deletes nothing, and `slopcamera doctor` prints the command that restores it. |
| `support` | `slopcamera support` | Links for updates and paid support. |
| `support.diagnostics` | `slopcamera doctor` | Add `--json` for a copyable report; `slopcamera status --json` has the same state the menu copied. |
| `quit` | `slopcamera tui` | There is no background process to quit. Press `q` to leave the TUI. |

## States

The menu had a fixture per state: first run, empty, ready, rendering, error, low credits, stale job and a login item changed outside Slopcamera. Each has a golden under `apps/desktop/cli/fixtures/status/`, plus one for an old login item that `legacy retire` can move. The menu's "action error" state has no equivalent: a command that fails reports its own error and exit code.

## Approvals

`slopcamera runs approve` keeps its current behaviour and is listed as `decide-legacy` in `slopcamera commands --json`. No command waits for a person at a prompt.
