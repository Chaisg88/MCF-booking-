// One-time deployment bootstrap. Runs only while a private setup marker is configured.
// Never prints connection strings, keys, generated passwords, or recovery links.
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
if(!process.env.ASSETTRACK_SETUP_TOKEN){console.log('Database bootstrap disabled (normal build).');process.exit(0)}
const {POSTGRES_URL,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY}=process.env;
if(!POSTGRES_URL||!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY){console.error('Database integration variables missing.');process.exit(1)}
const connection=new URL(POSTGRES_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])connection.searchParams.delete(k);
const ca=await Promise.all(['prod-ca-2021.crt','prod-ca-2025.crt'].map(name=>readFile(new URL('../supabase/'+name,import.meta.url),'utf8')));
const client=new Client({connectionString:connection.toString(),ssl:{rejectUnauthorized:true,ca},connectionTimeoutMillis:20000,query_timeout:45000});
try{
await client.connect();await client.query('SELECT pg_advisory_lock(72918420)');
const exists=await client.query("select to_regclass('public.profiles') as profiles");
if(!exists.rows[0].profiles){await client.query('BEGIN');try{await client.query(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));await client.query('COMMIT');console.log('Inventory schema installed.')}catch(e){await client.query('ROLLBACK');throw e;}}
const db=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const email='huatchaisg@gmail.com';
let id=(await client.query('select id from auth.users where lower(email)=$1',[email])).rows[0]?.id;
if(!id){const r=await db.auth.admin.createUser({email,password:process.env.ROOT_ADMIN_PASSWORD||randomBytes(32).toString('base64url'),email_confirm:true,user_metadata:{full_name:'Company Administrator'}});if(r.error)throw r.error;id=r.data.user.id;console.log('Root account created with a private initial password.');}
const p=await db.from('profiles').update({role:'admin',approved:true,department:'IT & Systems'}).eq('id',id).select('id').single();if(p.error)throw p.error;
console.log('Root administrator permissions verified.');
const a=await db.from('assets').select('id',{count:'exact',head:true});if(a.error)throw a.error;
console.log('Shared inventory API verified.');
const link=await db.auth.admin.generateLink({type:'recovery',email,options:{redirectTo:'https://mcf-equipment-booking.vercel.app/reset-password'}});
if(link.error)throw link.error;
console.log('Password recovery redirect:',link.data.properties.redirect_to);
const staffClient=createClient(SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const login=await staffClient.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'recovery'});if(login.error)throw login.error;
const authProfile=await staffClient.from('profiles').select('role,approved').eq('id',id).single();if(authProfile.error||authProfile.data.role!=='admin'||!authProfile.data.approved)throw Error('Root authentication check failed');
console.log('Root sign-in and database permissions verified.');
await staffClient.auth.signOut();
const recovery=await db.auth.resetPasswordForEmail(email,{redirectTo:'https://mcf-equipment-booking.vercel.app/reset-password'});
console.log(recovery.error?'Password recovery email could not be sent; use Forgot password after mail settings are configured.':'Root password recovery email requested.');
}catch(e){console.error('Database bootstrap failed.', 'Code:',e.code||e.name||'unknown');process.exitCode=1;}finally{await client.end().catch(()=>{});}
