import { attachFoil, attachHeroLight, installAppearanceMenus } from "@hraness/design-kit/browser"

import { installCopyCommands } from "./copy-command"
import { installExamplePlayers } from "./example-player"

// The static builder resolves these two colors from the shared palette. Keep
// the complete palette table out of the browser's appearance controller.
declare const __SLOPCAMERA_DARK_THEME_COLOR__: string
declare const __SLOPCAMERA_LIGHT_THEME_COLOR__: string

function installPageControls(): void {
  installCopyCommands()
  installExamplePlayers()
  attachFoil(document.documentElement)
  const hero = document.querySelector<HTMLElement>(".slopcamera-product-hero")
  if (hero) attachHeroLight(hero)
}

installAppearanceMenus({
  darkThemeColor: __SLOPCAMERA_DARK_THEME_COLOR__,
  lightThemeColor: __SLOPCAMERA_LIGHT_THEME_COLOR__,
  storageKey: "slopcamera.appearance",
})

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installPageControls, { once: true })
} else {
  installPageControls()
}
