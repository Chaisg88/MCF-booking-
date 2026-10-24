import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {departments} from '@/lib/model';
export async function POST(req:NextRequest){
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)return NextResponse.json({error:'Staff provisioning is unavailable.'},{status:503});
const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');
if(!token)return NextResponse.json({error:'Sign in as administrator.'},{status:401});
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:auth,error:authError}=await db.auth.getUser(token);
if(authError||!auth.user)return NextResponse.json({error:'Session expired. Sign in again.'},{status:401});
const {data:profile}=await db.from('profiles').select('role,approved').eq('id',auth.user.id).single();
if(!profile?.approved||profile.role!=='admin')return NextResponse.json({error:'Administrator access required.'},{status:403});
try{
const body=await req.json();
const {email,password,full_name,department}=body;
if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128||typeof full_name!=='string'||!full_name.trim()||full_name.length>120||!departments.includes(department))return NextResponse.json({error:'Enter a valid email, name, department, and password of 12–128 characters.'},{status:400});
const created=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:full_name.trim()}});
if(created.error)return NextResponse.json({error:created.error.code==='email_exists'?'An account already exists for this email.':'Could not create staff account. Check the email and password requirements.'},{status:400});
const id=created.data.user.id;
const updated=await db.from('profiles').update({approved:true,department}).eq('id',id).select('id').single();
if(updated.error){await db.auth.admin.deleteUser(id);return NextResponse.json({error:'Could not prepare staff permissions.'},{status:500});}
// Record using the administrator's authenticated transaction function.
const actor=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
await actor.rpc('set_staff_access',{user_id:id,enabled:true,staff_department:department});
return NextResponse.json({created:true});
}catch{return NextResponse.json({error:'Unable to create staff account.'},{status:500});}
}
