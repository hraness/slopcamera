# Unbundled menu-bar companion release contract

The `slopcamera menubar` command runs a prebuilt macOS companion in the
foreground by default. Launching it never invokes the Rust or Bun build.

The canonical npm archive is produced by a Linux release workflow and remains
platform-neutral. Slopcamera has no desktop application release: the companion is
an unbundled status-item executable and requires no installer, signing, or
notarization. The menu-bar executable is a platform-specific companion
asset published alongside that archive for supported architectures:

```
slopcamera-menubar-darwin-arm64
slopcamera-menubar-darwin-x64
```

Each asset needs a manifest binding the exact tag and source commit to the
architecture, executable byte length, and SHA-256 digest. Installation should
verify the manifest and copy the companion into:

```
~/Library/Application Support/Slopcamera/menubar/slopcamera-menubar
```

The `slopcamera` CLI resolves the matching companion executable from the
installed package or an explicit `SLOPCAMERA_MENUBAR` path and fails closed
when neither is available. It never downloads, compiles, or launches a desktop
application. Do not add a source-build fallback or an unverified download to
the launch path.
