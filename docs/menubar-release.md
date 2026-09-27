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
`~/Library/Application Support/Slopcamera/menubar/slopcamera-menubar` and runs
that copy's own `install`, which writes the per-user login item through
desktop-foundation's shared LaunchAgent helper (`app.hraness.slopcamera`).
Repeating installation replaces the executable and repoints the login item.
Set `SLOPCAMERA_MENUBAR` explicitly when upgrading from a new build. Existing
shared directory permissions are preserved; login items changed by something
else, symbolic links, and files writable by other users are refused.

Earlier releases wrote `com.hraness.slopcamera.menubar.plist`. Install and
uninstall remove it when it is exactly the file those releases wrote; a copy
that is already running keeps running until you quit it or log out.

`menubar status` asks the installed copy whether its login item is on and
whether it is running. Status and uninstall work without the original build.
Uninstall removes the login item and the installed executable.

The menu shows what Slopcamera is doing and your last known credits balance.
The CLI writes both to `menubar-status.json` in its state folder: a plain label
around each rendering or generating command, the fixed error code when one
fails, and the balance after `slopcamera credits status`. The file holds no
paths, prompts, tokens or account identifiers.

Because released packages don't include the menu bar yet, `slopcamera help`
doesn't list it; `slopcamera help menubar` still documents it.

The launcher checks an explicit `SLOPCAMERA_MENUBAR` path, a companion beside the
Bun executable, the installed companion, then a repository release build. It
never downloads or compiles a missing executable.

Future native release assets must bind the exact tag and source commit to the
architecture, executable byte length, and SHA-256 digest in a verified manifest.
The proposed names are `slopcamera-menubar-darwin-arm64` and
`slopcamera-menubar-darwin-x64`. This is a distribution requirement, not a claim
that those assets are currently published.
