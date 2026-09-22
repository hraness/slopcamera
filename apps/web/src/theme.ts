import { installAppearanceMenus } from "@hraness/design-kit/browser"

import { installCopyCommands } from "./copy-command"
import { installExamplePlayers } from "./example-player"

function installPageControls(): void {
  installCopyCommands()
  installExamplePlayers()
}

installAppearanceMenus({
  darkThemeColor: "#12100f",
  lightThemeColor: "#f8f7f4",
  storageKey: "slopcamera.appearance",
})

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installPageControls, { once: true })
} else {
  installPageControls()
}
