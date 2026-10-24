import {test,expect} from '@playwright/test';
const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
test.describe('password change',()=>{
  test.skip(!supabaseUrl,'Requires a build configured with the same public Supabase URL as this test process.');
  test('submits the password after asynchronous session lookup',async({page})=>{
    const ref=new URL(supabaseUrl!).hostname.split('.')[0];
    const user={id:'11111111-1111-4111-8111-111111111111',email:'password-test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
    const exp=Math.floor(Date.now()/1000)+3600;
    const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp,role:'authenticated'},'test-signature'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.');
    await page.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${ref}-auth-token`,session:{access_token:token,refresh_token:'test-refresh-token',expires_at:exp,expires_in:3600,token_type:'bearer',user}});
    let submittedPassword:string|undefined;
    await page.route(`${supabaseUrl}/auth/v1/**`,async route=>{
      if(route.request().method()==='PUT')submittedPassword=route.request().postDataJSON().password;
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)});
    });
    await page.goto('/reset-password');
    await page.getByLabel('New password').fill('Regression-test-password-42');
    await page.getByRole('button',{name:'Update password',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Password updated successfully');
    expect(submittedPassword).toBe('Regression-test-password-42');
    await expect(page.getByLabel('New password')).toHaveValue('');
  });
  test('explains when the user is signed out',async({page})=>{
    await page.goto('/reset-password');
    await page.getByLabel('New password').fill('Regression-test-password-42');
    await page.getByRole('button',{name:'Update password',exact:true}).click();
    await expect(page.getByRole('alert').filter({hasText:'You are signed out.'})).toContainText('You are signed out. Sign in first');
  });
});
