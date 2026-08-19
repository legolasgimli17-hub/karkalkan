'use strict';

const SUPABASE_URL='https://ilybqwjhkxfzociyvpeg.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_tix7qkJot2-3Hvik5kZvFg_SCYaZuzV';
const SESSION_KEY='karkalkan.v4.session';
const ACTIVE_CONNECTION_KEY='karkalkan.v4.activeConnection';
const CONFIRMATION='HESABIMI SİL';

const identity=document.getElementById('accountIdentity');
const emailInput=document.getElementById('deleteEmail');
const confirmationInput=document.getElementById('deleteConfirmation');
const deleteButton=document.getElementById('deleteAccountBtn');
const message=document.getElementById('accountMessage');
let session=null;
let retried=false;

function setMessage(text='',kind=''){
  if(!message)return;
  message.textContent=text;
  message.className=`account-message${kind?` ${kind}`:''}`;
}
function readSession(){
  try{
    const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
    if(!value||typeof value!=='object')return null;
    if(typeof value.access_token!=='string'||typeof value.refresh_token!=='string')return null;
    if(!value.user||typeof value.user.email!=='string')return null;
    return value;
  }catch{return null;}
}
function saveSession(value){
  session=value;
  sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));
}
function clearKarkalkanSession(){
  session=null;
  for(const key of Object.keys(sessionStorage))if(key.startsWith('karkalkan.'))sessionStorage.removeItem(key);
  sessionStorage.removeItem(ACTIVE_CONNECTION_KEY);
}
async function readJson(response){
  const text=await response.text();
  if(!text)return {};
  try{return JSON.parse(text)}catch{return {error:'INVALID_SERVER_RESPONSE'}}
}
async function refreshSession(){
  if(!session?.refresh_token)throw new Error('UNAUTHORIZED');
  const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{
    method:'POST',
    headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:session.refresh_token}),
    cache:'no-store'
  });
  const data=await readJson(response);
  if(!response.ok)throw new Error('UNAUTHORIZED');
  const now=Math.floor(Date.now()/1000);
  saveSession({
    access_token:String(data.access_token||''),
    refresh_token:String(data.refresh_token||session.refresh_token),
    expires_at:Number(data.expires_at)||now+Number(data.expires_in||3600),
    user:{id:String(data.user?.id||session.user?.id||''),email:String(data.user?.email||session.user?.email||'')}
  });
  return session.access_token;
}
async function accessToken(){
  if(!session)throw new Error('UNAUTHORIZED');
  const now=Math.floor(Date.now()/1000);
  if(Number(session.expires_at||0)-now<90)return refreshSession();
  return session.access_token;
}
async function deleteAccountRequest(){
  const token=await accessToken();
  const response=await fetch(`${SUPABASE_URL}/functions/v1/account-delete`,{
    method:'POST',
    headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({email:String(emailInput?.value||'').trim().toLowerCase(),confirmation:String(confirmationInput?.value||'').trim()}),
    cache:'no-store'
  });
  const data=await readJson(response);
  if(response.status===401&&!retried&&session?.refresh_token){
    retried=true;
    await refreshSession();
    return deleteAccountRequest();
  }
  retried=false;
  if(!response.ok){const error=new Error(String(data?.error||`HTTP_${response.status}`));error.status=response.status;throw error;}
  return data;
}
function humanError(error){
  const code=String(error?.message||'');
  const map={
    UNAUTHORIZED:'Oturumun geçersiz veya süresi dolmuş. Uygulamadan tekrar giriş yap.',
    ACCOUNT_DELETE_CONFIRMATION_INVALID:'E-posta veya onay ifadesi hesap bilgilerinle eşleşmiyor.',
    ACCOUNT_DELETE_ACTIVE_SUBSCRIPTION:'Önce Abonelik ve Fatura bölümünden aktif aboneliğini sona erdir. Abonelik kapandıktan sonra hesabı silebilirsin.',
    ACCOUNT_DELETE_STORAGE_BLOCKED:'Hesaba bağlı dosyalar silme işlemini engelliyor. Destek üzerinden veri silme talebi oluştur.',
    ACCOUNT_DELETE_PREFLIGHT_FAILED:'Hesap silme ön kontrolü tamamlanamadı. Daha sonra tekrar dene.',
    ACCOUNT_DELETE_FAILED:'Hesap şu anda silinemedi. İşlem güvenli biçimde durduruldu.'
  };
  return map[code]||'Hesap silme işlemi tamamlanamadı.';
}
function validConfirmation(){
  const email=String(emailInput?.value||'').trim().toLowerCase();
  const confirmation=String(confirmationInput?.value||'').trim();
  return Boolean(session?.user?.email)&&email===String(session.user.email).trim().toLowerCase()&&confirmation===CONFIRMATION;
}
function updateButton(){if(deleteButton)deleteButton.disabled=!validConfirmation();}

session=readSession();
if(!session){
  if(identity)identity.textContent='Aktif KârKalkan oturumu bulunamadı. Önce uygulamadan giriş yap.';
  if(deleteButton)deleteButton.disabled=true;
}else{
  if(identity)identity.textContent=`Oturum açık: ${session.user.email}`;
  if(emailInput)emailInput.placeholder=session.user.email;
  updateButton();
}
emailInput?.addEventListener('input',updateButton);
confirmationInput?.addEventListener('input',updateButton);
deleteButton?.addEventListener('click',async()=>{
  if(!validConfirmation()){setMessage('E-posta adresini ve HESABIMI SİL ifadesini doğru yaz.','bad');return;}
  deleteButton.disabled=true;
  const label=deleteButton.textContent;
  deleteButton.textContent='Hesap siliniyor…';
  setMessage('');
  try{
    const result=await deleteAccountRequest();
    if(!result?.deleted)throw new Error('ACCOUNT_DELETE_FAILED');
    clearKarkalkanSession();
    setMessage('Hesabın ve KârKalkan çalışma alanı verilerin silindi.','good');
    location.replace('/');
  }catch(error){
    setMessage(humanError(error),'bad');
    updateButton();
  }finally{
    deleteButton.textContent=label;
    if(session)updateButton();
  }
});
