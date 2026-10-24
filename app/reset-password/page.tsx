'use client';
import {useState} from 'react';
import {database} from '@/lib/supabase';

export default function ResetPassword(){
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [updated,setUpdated]=useState(false);
  return <main className="auth-wrap"><section className="auth-card">
    <h1>Set a new password</h1>
    <p className="muted">Choose a new password for your signed-in account. If you are signed out, sign in first or use your password recovery link.</p>
    <form onSubmit={async e=>{
      e.preventDefault();
      // React's currentTarget is only available during the synchronous event handler.
      const form=e.currentTarget;
      const password=String(new FormData(form).get('password')||'');
      setBusy(true);setMessage('');setUpdated(false);
      try{
        if(!database)throw Error('Connect the database first.');
        const session=await database.auth.getSession();
        if(session.error)throw session.error;
        if(!session.data.session)throw Error('You are signed out. Sign in first, then open Change password again.');
        const result=await database.auth.updateUser({password});
        if(result.error)throw result.error;
        form.reset();setUpdated(true);
        setMessage('Password updated successfully. Use your new password the next time you sign in.');
      }catch(error){setMessage(error instanceof Error?error.message:'Unable to update password. Please try again.');}
      finally{setBusy(false);}
    }}>
      <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy}/></label>
      <p className="helper">Use at least 12 characters.</p>
      <button className="primary" disabled={busy}>{busy?'Updating…':'Update password'}</button>
    </form>
    {message&&<p role={updated?'status':'alert'} className={updated?'success':'error'}>{message}</p>}
    <a className="text-link" href="/admin">Return to super admin login</a>
  </section></main>;
}
