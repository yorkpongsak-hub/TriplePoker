import { supabaseAdmin } from '../config/supabase'

/** Returns a short-lived image URL for a VIP custom photo, otherwise its preset key. */
export async function resolveProfileAvatar(profile:{avatar_url?:string|null;profile_image_url?:string|null;vip_status?:string|null}):Promise<string|null>{
  if(profile.vip_status!=='none'&&profile.profile_image_url){
    const {data,error}=await supabaseAdmin.storage.from('avatars').createSignedUrl(profile.profile_image_url,3600)
    if(!error&&data?.signedUrl)return data.signedUrl
  }
  return profile.avatar_url??null
}

export async function resolveProfileAvatars<T extends {user_id:string;avatar_url?:string|null;profile_image_url?:string|null;vip_status?:string|null}>(profiles:readonly T[]){
  const entries=await Promise.all(profiles.map(async profile=>[profile.user_id,await resolveProfileAvatar(profile)] as const))
  return new Map(entries)
}
