const SERVER_URL=process.env.EXPO_PUBLIC_SERVER_URL||'http://localhost:3001';
export type CountryState={country_code:string|null;source:'network'|'manual'|'hidden'|null};
export async function saveCountry(token:string,mode:'auto'|'manual'|'hidden'='auto',country?:string):Promise<CountryState>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(`${SERVER_URL}/profile/country`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({mode,country}),signal:controller.signal});
    if(!response.ok)throw new Error('Could not save your country. Please try again.');
    return await response.json();
  }finally{clearTimeout(timer);}
}
