/** Independent current-design identity. Historical migration/refinement
 * profiles and immutable receipts retain their existing meanings. */
export const supportScope = "optional-support-v1"
export const supportCopyScope = "optional-support-copy-v1"
export const supportBaselineProfile = "before-optional-support-425066a-v1"
export const supportBaselineRevision = "425066a62a62bf76e3a5e8562c4199e4ec108b9e"
export const supportBaselineTree = "7c953911e82f256fe981794902b7234960f8a4af"
export const supportFooterDigests = {
  baseline: "0dd4fdbd38b4d49f0597653350beebb0a9ab85389ec6f78fcc9fa65685880b92",
  // The v0.14.0 canonical footer (Ra mark plus "by Hraness" lockup, icon-only
  // support target) as serialized beside the new in-flow content footer.
  current: "96248be1be9c578aa56252cfec665a79421486c2c1b56d470e612fc3e4435bdf",
} as const
export const supportHref = "https://account.hraness.com/support?product=slopcamera&source=web#support"
/** The immutable support baseline (425066a) advertises v3.2.6; the current page
 * advertises the verified v3.3.2 release, so the copy scope compares each side
 * against its own exact install command while the copy state machine stays
 * paired. The full-page optional-support-v1 pairing was accepted at 8ba5b24,
 * before v3.2.8 was advertised. */
export const supportBaselineInstallCommand = "bun add --global https://github.com/hraness/slopcamera/releases/download/v3.2.6/hraness-slopcamera-3.2.6.tgz\nslopcamera skill install --target agents"
