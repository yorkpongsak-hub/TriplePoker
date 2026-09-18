import { adProvider } from '../../src/game/adProvider'

describe('ad provider test-mode gate', () => {
  const oldNode=process.env.NODE_ENV,oldMode=process.env.AD_PROVIDER_MODE
  afterEach(()=>{process.env.NODE_ENV=oldNode;process.env.AD_PROVIDER_MODE=oldMode})
  test('google test reward requires the earned callback marker',async()=>{
    process.env.NODE_ENV='production';process.env.AD_PROVIDER_MODE='google_test'
    await expect(adProvider.verifyRewardedCompletion({googleTestEarned:false})).resolves.toBe(false)
    await expect(adProvider.verifyRewardedCompletion({googleTestEarned:true})).resolves.toBe(true)
  })
  test('production without explicit test mode fails closed',async()=>{
    process.env.NODE_ENV='production';delete process.env.AD_PROVIDER_MODE
    await expect(adProvider.verifyRewardedCompletion({devMock:true,googleTestEarned:true})).resolves.toBe(false)
  })
})
