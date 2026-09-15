# Unbundled menu-bar companion distribution

The `slopcamera menubar` command runs a prebuilt macOS companion in the
foreground by default. Launching it never invokes the Rust or Bun build.

The canonical package archive is produced by a Linux release workflow and
remains platform-neutral. The current release workflow does not publish native
menu-bar executables. Build one explicitly from the reviewed source:

```sh
cargo build --release --manifest-path desktop/menubar/Cargo.toml
SLOPCAMERA_MENUBAR="$PWD/desktop/target/release/slopcamera-menubar" slopcamera menubar install
```

The companion is an unbundled status-item executable. Installation creates no
application bundle and performs no signing or notarization. macOS may still
apply its security policy to executables downloaded from the internet.

`menubar install` copies the selected prebuilt executable into
`~/Library/Application Support/Slopcamera/menubar/slopcamera-menubar` and
registers an exact per-user LaunchAgent. Repeating installation stops the owned
service, replaces its executable, and starts it again, including after a failed
bootstrap. Set `SLOPCAMERA_MENUBAR` explicitly when upgrading from a new build.
Existing shared directory permissions are preserved; foreign plists, symbolic
links, and files writable by other users are refused.

`menubar status` reports the installed configuration, not process liveness.
Status and uninstall work without the original build. Uninstall removes only
the exact owned LaunchAgent and its installed executable.

The launcher checks an explicit `SLOPCAMERA_MENUBAR` path, a companion beside the
Bun executable, the installed companion, then a repository release build. It
never downloads or compiles a missing executable.

Future native release assets must bind the exact tag and source commit to the
architecture, executable byte length, and SHA-256 digest in a verified manifest.
The proposed names are `slopcamera-menubar-darwin-arm64` and
`slopcamera-menubar-darwin-x64`. This is a distribution requirement, not a claim
that those assets are currently published.
