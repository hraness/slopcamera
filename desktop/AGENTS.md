# Contents

- `menubar/` – the `slopcamera-menubar` Rust binary: an unbundled macOS status item on menu kit v2 that shows render and credits status and the newest outputs. `fixtures/` holds one menu snapshot per state; `UPDATE_MENU_FIXTURES=1 cargo test` regenerates them and CI runs `companion lint-menu --strict` over them.

# Guidelines

- The menu-bar companion is a disposable client. It reads `~/Library/Application Support/Slopcamera/outputs` and the CLI's `cli/menubar-status.json` (or the platform state equivalents), and opens or reveals files. Product authority stays in the `slopcamera` CLI; the status file carries only fixed labels, times, error codes and the balance string.
- Manage the login item only through desktop-foundation's `service` helper (`slopcamera-menubar install|uninstall|status|start`). The CLI copies the build into place and delegates.
- Consume `desktop-foundation` only through its immutable git tag. Product-neutral behavior belongs upstream; keep this crate a thin adapter.
- Keep the binary unbundled and privilege-free: `slopcamera menubar` spawns a shipped prebuilt executable directly. This project deliberately does not produce or distribute an `.app`; signing and notarization are outside the companion contract.
- Do not put credentials, raw socket paths, or secret environment values in menu labels, tooltips, logs, or argv.
- `target/` is ignored. Keep `Cargo.lock` committed for the binary workspace.
