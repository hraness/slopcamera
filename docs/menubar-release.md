# Menu-bar companion release contract

The `slopcamera menubar` command runs a prebuilt macOS companion in the
foreground by default. Launching it never invokes the Rust or Bun build.

The canonical npm archive is produced by a Linux release workflow and remains
platform-neutral. A macOS release job must publish separate immutable sidecar
assets for supported architectures:

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

Until that macOS sidecar job is admitted, the CLI accepts only an existing
prebuilt binary or the explicit `SLOPCAMERA_DESKTOP` override and fails closed
when neither is available. Do not add a source-build fallback or an unverified
download to the launch path.
