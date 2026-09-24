import { paletteColors } from "@hraness/design-kit"
import { attachFoil, attachHeroLight, installAppearanceMenus } from "@hraness/design-kit/browser"

import { installCopyCommands } from "./copy-command"
import { installExamplePlayers } from "./example-player"

function installPageControls(): void {
  installCopyCommands()
  installExamplePlayers()
  attachFoil(document.documentElement)
  const hero = document.querySelector<HTMLElement>(".slopcamera-product-hero")
  if (hero) attachHeroLight(hero)
}

installAppearanceMenus({
  darkThemeColor: paletteColors.catppuccin.dark.background,
  lightThemeColor: paletteColors.catppuccin.light.background,
  storageKey: "slopcamera.appearance",
})

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installPageControls, { once: true })
} else {
  installPageControls()
}
