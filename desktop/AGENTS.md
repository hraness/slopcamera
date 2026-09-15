# Contents

- `menubar/` – the `slopcamera-menubar` Rust binary: an unbundled macOS status item that renders the per-user agent outputs directory newest-first with image thumbnails.

# Guidelines

- The menu-bar companion is a disposable client. It reads `~/Library/Application Support/Slopcamera/outputs` (or the platform state equivalent), renders filename stems as menu items, and opens or reveals files. Product authority stays in the `slopcamera` CLI.
- Consume `desktop-foundation` only through its immutable git tag. Product-neutral behavior belongs upstream; keep this crate a thin adapter.
- Keep the binary unbundled and privilege-free: `slopcamera menubar` spawns a shipped prebuilt executable directly. This project deliberately does not produce or distribute an `.app`; signing and notarization are outside the companion contract.
- Do not put credentials, raw socket paths, or secret environment values in menu labels, tooltips, logs, or argv.
- `target/` is ignored. Keep `Cargo.lock` committed for the binary workspace.
