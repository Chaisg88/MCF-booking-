/** Run locally once with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ROOT_ADMIN_PASSWORD.
 * The service role key must never use a NEXT_PUBLIC_ prefix or enter browser code.
 */
import { createClient } from '@supabase/supabase-js';
const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,ROOT_ADMIN_PASSWORD}=process.env;
const email=process.env.ROOT_ADMIN_EMAIL||'Huatchaisg@gmail.com';
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY||!ROOT_ADMIN_PASSWORD){console.error('Required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ROOT_ADMIN_PASSWORD. No credentials were printed.');process.exit(1)}
if(ROOT_ADMIN_PASSWORD.length<12){console.error('Use an initial password of at least 12 characters.');process.exit(1)}
const db=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
try{
// Creation deliberately fails for an existing account. Never silently reset another user's password.
const {data,error}=await db.auth.admin.createUser({email,password:ROOT_ADMIN_PASSWORD,email_confirm:true,user_metadata:{full_name:'Company Administrator'}});
if(error)throw error;
const r=await db.from('profiles').update({role:'admin',approved:true,department:'IT & Systems'}).eq('id',data.user.id).select('id').single();
if(r.error){await db.auth.admin.deleteUser(data.user.id);throw r.error;}
console.log('Root administrator created. Sign in at /admin and change the initial password using the password reset flow.');
}catch(e){console.error('Administrator setup failed:',e.message);process.exit(1)}
