# Contents

- `menubar/` – the `slopcamera-menubar` Rust binary: a Tauri status item that renders the per-user agent outputs directory newest-first with image thumbnails.

# Guidelines

- The menu-bar companion is a disposable client. It reads `~/Library/Application Support/Slopcamera/outputs` (or the platform state equivalent), renders filename stems as menu items, and opens or reveals files. Product authority stays in the `slopcamera` CLI.
- Consume `desktop-foundation` only through its immutable git tag. Product-neutral behavior belongs upstream; keep this crate a thin adapter.
- Keep the binary unbundled and privilege-free: `slopcamera menubar` spawns the Cargo-built executable directly. No `.app` packaging, signing, or notarization is required for development.
- Do not put credentials, raw socket paths, or secret environment values in menu labels, tooltips, logs, or argv.
- `target/` is ignored. Keep `Cargo.lock` committed for the binary workspace.
