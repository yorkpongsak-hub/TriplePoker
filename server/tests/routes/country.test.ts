const mockGetUser=jest.fn();
const mockUpsert=jest.fn();
const mockSingle=jest.fn();
const mockIn=jest.fn();
const mockEq=jest.fn(()=>({maybeSingle:mockSingle}));
jest.mock('../../src/config/supabase',()=>({supabase:{auth:{getUser:mockGetUser}},supabaseAdmin:{from:()=>({upsert:mockUpsert,select:()=>({eq:mockEq,in:mockIn})})}}));
import Fastify from 'fastify';
import {countryRoutes,withCountries} from '../../src/routes/country';
import {countryCode,COUNTRY_CODES,detectCountry} from '../../src/utils/playerCountry';
import {readFileSync} from 'fs';
import {resolve} from 'path';
beforeEach(()=>{jest.clearAllMocks();delete process.env.COUNTRY_GEO_PROVIDER;mockGetUser.mockResolvedValue({data:{user:{id:'self'}},error:null});mockUpsert.mockResolvedValue({error:null});mockSingle.mockResolvedValue({data:null,error:null});});
afterEach(()=>{delete process.env.COUNTRY_GEO_PROVIDER;});
async function post(payload:object={},headers:Record<string,string>={authorization:'Bearer token'}){
  const app=Fastify();await app.register(countryRoutes);
  try{return await app.inject({method:'POST',url:'/profile/country',payload,headers});}finally{await app.close();}
}
test('only supported country codes, never infer country from language',()=>{
  expect(COUNTRY_CODES).toHaveLength(249);expect(new Set(COUNTRY_CODES).size).toBe(249);
  expect(countryCode(' th ')).toBe('TH');for(const v of ['XX','T1','EN','USA','<script>',null])expect(countryCode(v)).toBeNull();
  expect(detectCountry({'cf-ipcountry':'TH'},undefined)).toBeNull();
  expect(detectCountry({'cf-ipcountry':'TH'},'cloudflare')).toBe('TH');
  expect(detectCountry({'x-vercel-ip-country':'JP'},'vercel')).toBe('JP');
  expect(detectCountry({'cf-ipcountry':'XX','accept-language':'th'},'cloudflare')).toBeNull();
});
test('client flag assets exactly cover validated server countries',()=>{
  const content=readFileSync(resolve(__dirname,'../../../client/src/country/countries.ts'),'utf8');
  expect([...content.matchAll(/code:"([A-Z]{2})"/g)].map(m=>m[1]).sort()).toEqual([...COUNTRY_CODES].sort());
});
test('requires authentication and rejects invalid choices',async()=>{
  expect((await post({},{})).statusCode).toBe(401);expect(mockUpsert).not.toHaveBeenCalled();
  expect((await post({mode:'manual',country:'XX'})).statusCode).toBe(400);
  expect((await post({mode:'invalid'})).statusCode).toBe(400);
  expect(mockUpsert).not.toHaveBeenCalled();
});
test('manual choice and hiding can only update caller identity',async()=>{
  expect((await post({mode:'manual',country:'TH',user_id:'victim'})).statusCode).toBe(200);
  expect(mockUpsert).toHaveBeenLastCalledWith(expect.objectContaining({user_id:'self',country_code:'TH',source:'manual'}),{onConflict:'user_id',ignoreDuplicates:false});
  await post({mode:'hidden'});
  expect(mockUpsert).toHaveBeenLastCalledWith(expect.objectContaining({country_code:null,source:'hidden'}),{onConflict:'user_id',ignoreDuplicates:false});
});
test('auto does not replace saved/manual/hidden country and ignores client supplied country',async()=>{
  process.env.COUNTRY_GEO_PROVIDER='cloudflare';
  mockSingle.mockResolvedValue({data:{country_code:'JP',source:'manual'},error:null});
  const result=await post({country:'US'},{authorization:'Bearer token','cf-ipcountry':'TH'});
  expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({country_code:'TH',source:'network'}),{onConflict:'user_id',ignoreDuplicates:true});
  expect(result.json()).toEqual({country_code:'JP',source:'manual'});
});
test('unknown network stays unset, optional database failure is explicit',async()=>{
  expect((await post({country:'TH'})).json()).toEqual({country_code:null,source:null});expect(mockUpsert).not.toHaveBeenCalled();
  mockUpsert.mockResolvedValue({error:{message:'missing migration'}});
  expect((await post({mode:'manual',country:'TH'})).statusCode).toBe(503);
});
test('country enrichment keeps scores and unknown countries without dropping ranking',async()=>{
  const entries=[{user_id:'one',rank:1,value:99},{user_id:'two',rank:2,value:88}];
  mockIn.mockResolvedValue({data:[{user_id:'one',country_code:'TH'}],error:null});
  expect(await withCountries(entries)).toEqual([{...entries[0],country_code:'TH'},{...entries[1],country_code:null}]);
  mockIn.mockResolvedValue({data:null,error:{message:'offline'}});
  expect(await withCountries(entries)).toEqual(entries.map(e=>({...e,country_code:null})));
});
