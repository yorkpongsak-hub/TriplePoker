import { isMonarchEnabled } from '../../src/config/releaseFeatures'

describe('release feature gates', () => {
  test('Monarch is fail-closed for Android 1.0', () => {
    expect(isMonarchEnabled({} as NodeJS.ProcessEnv)).toBe(false)
    expect(isMonarchEnabled({ MONARCH_ENABLED: 'false' } as NodeJS.ProcessEnv)).toBe(false)
    expect(isMonarchEnabled({ MONARCH_ENABLED: 'TRUE' } as NodeJS.ProcessEnv)).toBe(false)
  })

  test('Monarch requires the exact explicit enable value', () => {
    expect(isMonarchEnabled({ MONARCH_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(true)
  })
})
