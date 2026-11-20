/**
 * Provider boundary.  No provider credentials or production unit IDs belong in
 * this repository path.  The development adapter permits the existing VFX
 * mock; production fails closed until a provider callback is wired here.
 */
export interface AdProvider {
  forcedInterstitialAvailable(): Promise<boolean>
  verifyRewardedCompletion(input: { devMock?: boolean; googleTestEarned?: boolean }): Promise<boolean>
}
export const adProvider: AdProvider = {
  async forcedInterstitialAvailable() { return process.env.NODE_ENV !== 'production' },
  async verifyRewardedCompletion(input) {
    if (process.env.AD_PROVIDER_MODE === 'google_test') return input.googleTestEarned === true
    return process.env.NODE_ENV !== 'production' && input.devMock === true
  },
}
