// ตรวจการผ่าน guard ด้วยสิทธิ์ผู้เล่นจริงที่เข้า League ได้ แต่ยังไม่ปลดล็อกโต๊ะขั้นสูง
const mockPath={value:'/game/tier-d/ad'}
jest.mock('../../../client/node_modules/expo-router',()=>({
  usePathname:()=>mockPath.value,Stack:'GameStack',Redirect:'Redirect',router:{replace:jest.fn()},
}))
jest.mock('../../../client/node_modules/react-native',()=>({View:'View',ActivityIndicator:'ActivityIndicator'}))
jest.mock('../../../client/src/store/authStore',()=>({useAuthStore:()=>({
  isInitialized:true,session:{user:{is_anonymous:false}},profile:{display_name:'Test Player',tier_d_solo_level:151},
})}))
jest.mock('../../../client/src/launch/store',()=>({useLaunchStore:()=>({hydrated:true,progress:{}})}))
jest.mock('../../../client/src/launch/progress',()=>({tierDUnlocked:()=>false,advancedUnlocked:()=>false}))
jest.mock('../../../client/src/utils/authGuard',()=>({needsProfileSetup:()=>false}))
jest.mock('../../../client/src/hooks/useConfirmTableExit',()=>({useConfirmTableExit:()=>{}}))

test('League-only player can enter the table and rewarded ad without an advanced-table unlock',()=>{
  ;(globalThis as any).__DEV__=false
  const GameLayout=require('../../../client/app/game/_layout').default
  for(const path of ['/game/tier-d','/game/tier-d/ad']){
    mockPath.value=path
    expect(GameLayout().type).toBe('GameStack')
  }
  mockPath.value='/game/mastermind'
  expect(GameLayout().type).toBe('Redirect')
})
