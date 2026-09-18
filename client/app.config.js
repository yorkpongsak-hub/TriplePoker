const base = require('./app.json')

// The official sample application ID is restricted to Google test inventory.
// A real App ID is supplied only through build-time environment configuration.
const GOOGLE_TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
const requestedMode = process.env.EXPO_PUBLIC_AD_MODE || 'mock'
const releaseEnabled = requestedMode === 'production' && process.env.EXPO_PUBLIC_AD_RELEASE_GATE === 'enabled'
if (requestedMode === 'production' && !releaseEnabled) {
  throw new Error('Production ads require EXPO_PUBLIC_AD_RELEASE_GATE=enabled.')
}
const androidAppId = releaseEnabled ? process.env.ADMOB_ANDROID_APP_ID : GOOGLE_TEST_ANDROID_APP_ID
if (releaseEnabled && !androidAppId) throw new Error('Production ads require ADMOB_ANDROID_APP_ID at native build time.')

module.exports = () => ({
  ...base.expo,
  plugins: [...base.expo.plugins, ['react-native-google-mobile-ads', { androidAppId }]],
  extra: { ...base.expo.extra, adMode: releaseEnabled ? 'production' : requestedMode === 'google_test' ? 'google_test' : 'mock' },
})
