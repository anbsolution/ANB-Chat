import { useEffect, useState } from 'react';
import { ShieldCheck, MessageCircle, Video, Settings, LockKeyhole, Send, LogOut, Mail, Phone, UserRound, CircleHelp, Paperclip, MapPin, Download, FileText, Image as ImageIcon, Film } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { createIdentity, loadIdentity, saveIdentity, encryptForRecipient, decryptFromSender, keyFingerprint } from '../lib/crypto';
import { findRecipient, getProfileById, loadConversation, sendEncryptedMessage, subscribeToIncomingMessages } from '../lib/chat';
import { ATTACHMENT_MARKER, encryptAndUploadAttachment, downloadAndDecryptAttachment, type AttachmentMetadata } from '../lib/attachments';

type Profile = { id:string; email?:string; username?:string; public_key?:string };
export default function App() {
 const [session,setSession] = useState<any>(null); const [email,setEmail]=useState(''); const [otp,setOtp]=useState(''); const [otpSent,setOtpSent]=useState(false); const [notice,setNotice]=useState(''); const [busy,setBusy]=useState(false); const [active,setActive]=useState<'chats'|'calls'|'settings'>('chats'); const [target,setTarget]=useState(''); const [message,setMessage]=useState(''); const [messages,setMessages]=useState<{id:string; body:string; mine:boolean; time:string}[]>([]); const [profile,setProfile]=useState<Profile|null>(null); const [activeRecipient,setActiveRecipient]=useState<{id:string;email:string|null;username:string|null;public_key:string|null}|null>(null); const [fingerprint,setFingerprint]=useState(''); const [ownFingerprint,setOwnFingerprint]=useState(''); const [keyNotice,setKeyNotice]=useState(''); const [selectedFile,setSelectedFile]=useState<File|null>(null); const [attachmentBusy,setAttachmentBusy]=useState(false);
 useEffect(()=>{ if(!supabase) return; supabase.auth.getSession().then(({data})=>setSession(data.session)); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return ()=>subscription.unsubscribe(); },[]);
 useEffect(()=>{ if(!session || !supabase) return; let alive=true; (async()=>{ const user=session.user; const identityKey=user.email ?? user.id; const {data,error}=await supabase.from('profiles').select('*').eq('id',user.id).maybeSingle(); if(error) throw error; let identity=loadIdentity(identityKey); if(data?.public_key && !identity){ if(alive){setProfile(data);setNotice('Your existing encryption key is missing from this browser. For safety, ANB Chat did not replace it. Existing encrypted messages may be unavailable on this device.');} return; } if(!identity){identity=await createIdentity();saveIdentity(identityKey,identity);} const username=(user.email??'user').split('@')[0].toLowerCase(); if(!data){ const {error:insertError}=await supabase.from('profiles').insert({id:user.id,email:user.email,public_key:identity.publicKey,username}); if(insertError) throw insertError; } else if(!data.public_key){ const {error:updateError}=await supabase.from('profiles').update({public_key:identity.publicKey}).eq('id',user.id); if(updateError) throw updateError; } const {data:latest,error:latestError}=await supabase.from('profiles').select('*').eq('id',user.id).single(); if(latestError) throw latestError; if(alive)setProfile(latest); })().catch(e=>setNotice(e.message)); return ()=>{alive=false}; },[session]);
 useEffect(()=>{ let alive=true; if(profile?.public_key){ keyFingerprint(profile.public_key).then(value=>{if(alive)setOwnFingerprint(value)}).catch(()=>{if(alive)setOwnFingerprint('Could not calculate fingerprint')}); } return ()=>{alive=false}; },[profile?.public_key]);
 useEffect(()=>{ if(!session?.user || !supabase) return; const channel=subscribeToIncomingMessages(session.user.id, async incoming=>{ if(activeRecipient && incoming.sender_id===activeRecipient.id){ try { const rows=await loadConversation(activeRecipient.id); const own=loadIdentity(session.user.email ?? session.user.id); if(!own) return; const rendered=await Promise.all(rows.map(async row=>{ const mine=row.sender_id===session.user.id; const sender=mine?null:await getProfileById(row.sender_id); const senderKey=mine?own.publicKey:sender?.public_key; let body='[Unable to decrypt message]'; if(senderKey){ try { body=await decryptFromSender(row.ciphertext,senderKey,own.privateKey); } catch { body='[Cannot decrypt — verify contact key]'; } } return {id:row.id,body,mine,time:new Date(row.created_at).toLocaleTimeString()}; })); setMessages(rendered); } catch(e:any){ setNotice(e?.message ?? 'Could not refresh incoming messages.'); } } }); return ()=>{ void supabase?.removeChannel(channel); }; },[session,activeRecipient]);
 async function verifyContactKey(){ setFingerprint(''); setKeyNotice(''); try { const contact=await findRecipient(target); const value=await keyFingerprint(contact.public_key!); setActiveRecipient(contact); setFingerprint(value); setKeyNotice('Compare this fingerprint with your contact using a separate trusted channel. It is not verified until both sides compare it.'); } catch(e:any){setKeyNotice(e?.message ?? 'Could not load contact key.');} }
 async function requestOtp() {
   if (!supabase) {
     setNotice('Supabase setup required. Configure the repository secrets first.');
     return;
   }
   const normalizedEmail = email.trim().toLowerCase();
   if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
     setNotice('Enter a valid email address.');
     return;
   }
   setBusy(true);
   setNotice('');
   try {
     const result = await supabase.auth.signInWithOtp({
       email: normalizedEmail,
       options: { shouldCreateUser: true }
     });
     if (result.error) throw result.error;
     setEmail(normalizedEmail);
     setOtpSent(true);
     setNotice('If this address can receive mail, an email code has been sent. Check your inbox and spam folder.');
   } catch (e: any) {
     setNotice(e?.message ?? 'Could not send the email code.');
   } finally {
     setBusy(false);
   }
 }
 async function verifyOtp() {
   if (!supabase) {
     setNotice('Supabase setup required.');
     return;
   }
   const token = otp.trim();
   if (!/^\d{6,8}$/.test(token)) {
     setNotice('Enter the numeric code from your email.');
     return;
   }
   setBusy(true);
   setNotice('');
   try {
     const result = await supabase.auth.verifyOtp({
       email: email.trim().toLowerCase(),
       token,
       type: 'email'
     });
     if (result.error) throw result.error;
     if (!result.data.session) throw new Error('Verification succeeded but no session was returned. Try again.');
     setSession(result.data.session);
     setNotice('Email verified.');
   } catch (e: any) {
     setNotice(e?.message ?? 'Code verification failed.');
   } finally {
     setBusy(false);
   }
 }

 async function send() {
   if(!message.trim()||!target.trim()){setNotice('Enter a recipient email/username and a message.');return;}
   if(!supabase || !session?.user){setNotice('Sign in and configure Supabase first.');return;}
   setBusy(true); setNotice('');
   try {
     const recipient = await findRecipient(target);
     setActiveRecipient(recipient);
     if(recipient.id === session.user.id) throw new Error('Choose another account to start a conversation.');
     const ownIdentity = loadIdentity(session.user.email ?? session.user.id);
     if(!ownIdentity) throw new Error('Your encryption identity is missing. Sign out and sign in again to initialize it.');
     const ciphertext = await encryptForRecipient(message.trim(), recipient.public_key!, ownIdentity.privateKey, ownIdentity.publicKey);
     await sendEncryptedMessage(recipient.id, ciphertext);
     const rows = await loadConversation(recipient.id);
     const decrypted = await Promise.all(rows.map(async row => {
       const mine = row.sender_id === session.user.id;
       const senderProfile = mine ? null : await getProfileById(row.sender_id);
       const senderPublicKey = mine ? ownIdentity.publicKey : senderProfile?.public_key;
       if(!senderPublicKey) return { id:row.id, body:'[Unable to verify sender key]', mine, time:new Date(row.created_at).toLocaleTimeString() };
       try { return { id:row.id, body:await decryptFromSender(row.ciphertext, senderPublicKey, ownIdentity.privateKey), mine, time:new Date(row.created_at).toLocaleTimeString() }; }
       catch { return { id:row.id, body:'[Cannot decrypt this message — verify contact keys]', mine, time:new Date(row.created_at).toLocaleTimeString() }; }
     }));
     setMessages(decrypted); setMessage(''); setNotice('Encrypted message sent.');
   } catch(e:any) { setNotice(e?.message ?? 'Could not send message.'); }
   finally { setBusy(false); }
 }
 async function sendAttachment() {
   if(!selectedFile || !target.trim()){setNotice('Choose a file and enter the recipient first.');return;}
   if(!supabase || !session?.user){setNotice('Sign in and configure Supabase first.');return;}
   setAttachmentBusy(true);setNotice('Encrypting and uploading attachment…');
   let uploadedPath: string | null = null;
   try {
     const recipient=await findRecipient(target);
     if(recipient.id===session.user.id) throw new Error('Choose another account to share a file.');
     const own=loadIdentity(session.user.email ?? session.user.id);
     if(!own) throw new Error('Your encryption identity is missing.');
     const meta=await encryptAndUploadAttachment(selectedFile,{senderId:session.user.id,recipientId:recipient.id,senderPublicKey:own.publicKey,senderPrivateKey:own.privateKey,recipientPublicKey:recipient.public_key!});
     uploadedPath = meta.path;
     const payload=ATTACHMENT_MARKER+JSON.stringify(meta);
     const ciphertext=await encryptForRecipient(payload,recipient.public_key!,own.privateKey,own.publicKey);
     await sendEncryptedMessage(recipient.id,ciphertext);
     setActiveRecipient(recipient);setMessages(prev=>[...prev,{id:crypto.randomUUID(),body:payload,mine:true,time:new Date().toLocaleTimeString()}]);
     setSelectedFile(null);setNotice('Encrypted attachment sent.');
   } catch(e:any){
     if(uploadedPath && supabase){ try { await supabase.storage.from('anb-chat-attachments').remove([uploadedPath]); } catch { /* Best-effort cleanup; bucket RLS remains authoritative. */ } }
     setNotice(e?.message??'Could not send attachment.');
   }
   finally{setAttachmentBusy(false);}
 }
 async function openAttachment(body:string) {
   try {
     if(!body.startsWith(ATTACHMENT_MARKER)) throw new Error('Invalid attachment message.');
     const meta=JSON.parse(body.slice(ATTACHMENT_MARKER.length)) as AttachmentMetadata;
     const own=loadIdentity(session?.user?.email ?? session?.user?.id);
     if(!own) throw new Error('Your encryption identity is missing.');
     const blob=await downloadAndDecryptAttachment(meta,own.publicKey,own.privateKey);
     const url=URL.createObjectURL(blob); const anchor=document.createElement('a'); anchor.href=url; anchor.download=meta.name; anchor.rel='noopener'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),60000);
   } catch(e:any){setNotice(e?.message??'Could not open attachment.');}
 }
 async function shareLocation() {
   if(!navigator.geolocation){setNotice('Location sharing is not supported on this device/browser.');return;}
   if(!target.trim()){setNotice('Enter the recipient email or username first.');return;}
   setBusy(true);setNotice('Requesting location permission…');
   navigator.geolocation.getCurrentPosition(async position=>{
     try {
       const recipient=await findRecipient(target);
       if(!supabase||!session?.user) throw new Error('Sign in and configure Supabase first.');
       if(recipient.id===session.user.id) throw new Error('Choose another account to share your location.');
       const own=loadIdentity(session.user.email ?? session.user.id); if(!own) throw new Error('Your encryption identity is missing.');
       const {latitude,longitude,accuracy}=position.coords;
       const text=`📍 Shared location\nhttps://maps.google.com/?q=${latitude},${longitude}\nCoordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nAccuracy: about ${Math.round(accuracy)} m`;
       const ciphertext=await encryptForRecipient(text,recipient.public_key!,own.privateKey,own.publicKey); await sendEncryptedMessage(recipient.id,ciphertext);
       setActiveRecipient(recipient);setMessages(prev=>[...prev,{id:crypto.randomUUID(),body:text,mine:true,time:new Date().toLocaleTimeString()}]);setNotice('Location sent as an encrypted message.');
     } catch(e:any){setNotice(e?.message??'Could not share location.');} finally{setBusy(false);}
   },error=>{setNotice(error.code===1?'Location permission was denied. Allow it only if you want to share your location.':'Could not get location. Check device location settings and try again.');setBusy(false);},{enableHighAccuracy:false,timeout:12000,maximumAge:30000});
 }
 async function logout(){await supabase?.auth.signOut();setSession(null);setProfile(null);} 
 if(!session) return <main className="auth-shell">
  <section className="auth-card auth-card-pro">
    <div className="auth-brand-row">
      <img className="auth-logo" src="/anb-chat-icon.svg" alt="ANB Chat icon"/>
      <div><strong>ANB Chat</strong><small>Private messaging</small></div>
    </div>
    <div className="eyebrow">PRIVATE BY DESIGN</div>
    <h1>Your chats.<br/><span>Your privacy.</span></h1>
    <p className="muted">Sign in securely with a one-time code sent to your email. No password required.</p>
    <div className="security-note"><LockKeyhole size={18}/><span>Email verification · Encrypted messaging · No phone number required</span></div>
    <label htmlFor="anb-email">Email address</label>
    <input id="anb-email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} disabled={busy || otpSent} onChange={e=>setEmail(e.target.value)}/>
    {!otpSent ? <>
      <button className="primary auth-action" disabled={busy || !email.trim()} onClick={requestOtp}>{busy?'Sending code…':'Send email code'} <Mail size={17}/></button>
    </> : <>
      <label htmlFor="anb-otp">Email verification code</label>
      <input id="anb-otp" className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="Enter email code" value={otp} disabled={busy} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,8))}/>
      <button className="primary auth-action" disabled={busy || !/^\d{6,8}$/.test(otp.trim())} onClick={verifyOtp}>{busy?'Verifying…':'Verify code & sign in'} <ShieldCheck size={17}/></button>
      <button className="secondary" disabled={busy} onClick={()=>{setOtp('');setOtpSent(false);setNotice('Enter your email again to request a new code.');}}>Change email</button>
      <button className="text-action" disabled={busy} onClick={requestOtp}>Resend code</button>
    </>}
    {notice&&<p className="notice" role="status">{notice}</p>}
    <p className="tiny">By continuing, you agree to use ANB Chat responsibly.</p>
    {!isSupabaseConfigured&&<div className="setup-warning"><CircleHelp size={17}/> Demo mode — configure Supabase to enable accounts.</div>}
  </section>
 </main>;
 return <main className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark small"><ShieldCheck size={22}/></div><div><b>ANB Chat</b><small>Private messaging</small></div></div><div className="user-chip"><div className="avatar"><UserRound size={20}/></div><div className="user-meta"><b>{profile?.username??session.user.email?.split('@')[0]}</b><small>{session.user.email}</small></div><ShieldCheck size={17} className="verified"/></div><nav><button className={active==='chats'?'selected':''} onClick={()=>setActive('chats')}><MessageCircle size={19}/> Chats</button><button className={active==='calls'?'selected':''} onClick={()=>setActive('calls')}><Video size={19}/> Calls</button><button className={active==='settings'?'selected':''} onClick={()=>setActive('settings')}><Settings size={19}/> Settings</button></nav><div className="sidebar-bottom"><div className="e2ee-card"><LockKeyhole size={18}/><div><b>Encryption first</b><small>Private by design</small></div></div><button className="logout" onClick={logout}><LogOut size={18}/> Sign out</button></div></aside><section className="workspace">{active==='chats'?<><header className="topbar"><div><div className="eyebrow">MESSAGES</div><h2>Your conversations</h2></div><div className="online-pill"><span/> Secure session</div></header><div className="empty-state"><div className="empty-icon"><MessageCircle size={34}/></div><h3>Start a private conversation</h3><p>Start with a registered email address or username. Messages are encrypted on this device before upload.</p>{messages.length>0&&<div className="message-list">{messages.map(m=><div key={m.id} className={m.mine?'message-bubble mine':'message-bubble'}>{m.body.startsWith(ATTACHMENT_MARKER)?<><div className="attachment-card">{(()=>{try{const meta=JSON.parse(m.body.slice(ATTACHMENT_MARKER.length)) as AttachmentMetadata;return meta.mime.startsWith('image/')?<ImageIcon size={20}/>:meta.mime.startsWith('video/')?<Film size={20}/>:<FileText size={20}/>;}catch{return <FileText size={20}/>;}})()}<div><b>{(()=>{try{return (JSON.parse(m.body.slice(ATTACHMENT_MARKER.length)) as AttachmentMetadata).name}catch{return 'Encrypted attachment'}})()}</b><small>{(()=>{try{const meta=JSON.parse(m.body.slice(ATTACHMENT_MARKER.length)) as AttachmentMetadata;return `Encrypted ${meta.mime.startsWith('image/')?'image':meta.mime.startsWith('video/')?'video':'file'} · ${Math.max(1,Math.ceil(meta.size/1024))} KB`;}catch{return 'Encrypted attachment';}})()}</small></div><button className="attachment-download" onClick={()=>openAttachment(m.body)} aria-label="Download decrypted attachment"><Download size={17}/></button></div></>:m.body.startsWith('📍 Shared location')?<span>📍 Shared location<br/>{(()=>{const url=m.body.match(/https:\/\/maps\.google\.com\/\?q=-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/)?.[0];return url?<a href={url} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>:null;})()}<br/>{m.body.split('\n').filter(line=>!line.startsWith('📍')&&!line.startsWith('https://maps.google.com/')).join('\n')}</span>:<span>{m.body}</span>}<small>{m.time}</small></div>)}</div>}<div className="composer"><input aria-label="Recipient email or username" placeholder="Recipient email or username" value={target} onChange={e=>{setTarget(e.target.value);setFingerprint('');setKeyNotice('');}}/><button className="verify-key-button" disabled={busy||!target.trim()} onClick={verifyContactKey} aria-label="Verify contact key"><ShieldCheck size={18}/></button><input aria-label="Message" placeholder="Write a message…" value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/><button disabled={busy} onClick={send} aria-label="Send encrypted message"><Send size={18}/></button><div className="attachment-tools"><input id="attachment-picker" className="hidden-file-input" type="file" accept="image/*,video/*,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e=>setSelectedFile(e.target.files?.[0]??null)}/><label className="tool-button" htmlFor="attachment-picker"><Paperclip size={17}/> File / media</label><button className="tool-button" disabled={busy||attachmentBusy||!selectedFile} onClick={sendAttachment}><Send size={16}/> {attachmentBusy?'Sending…':'Send file'}</button><button className="tool-button" disabled={busy||attachmentBusy} onClick={shareLocation}><MapPin size={17}/> Share location</button>{selectedFile&&<span className="selected-file">{selectedFile.name} · {Math.max(1,Math.ceil(selectedFile.size/1024))} KB</span>}</div></div>{fingerprint&&<div className="fingerprint-card"><b>Contact key fingerprint</b><code>{fingerprint}</code></div>}{keyNotice&&<p className="notice">{keyNotice}</p>}{notice&&<p className="notice">{notice}</p>}</div></>:active==='calls'?<div className="settings-page"><div className="eyebrow">REAL-TIME</div><h2>Audio & video calls</h2><p className="muted">Call interface is planned around WebRTC. Reliable calling requires a signaling backend and a configured TURN service for networks that block direct peer connections.</p><div className="feature-row"><Phone/><div><b>Voice calls</b><small>Microphone permissions and WebRTC media</small></div></div><div className="feature-row"><Video/><div><b>Video calls</b><small>Camera, mute, camera switch and call controls</small></div></div></div>:<div className="settings-page"><div className="eyebrow">ACCOUNT & PRIVACY</div><h2>Settings</h2><div className="feature-row"><Mail/><div><b>Email identity</b><small>{session.user.email}</small></div></div><div className="feature-row"><ShieldCheck/><div><b>Your public-key fingerprint</b><small>{profile?.public_key ? 'Use this identity fingerprint for an out-of-band comparison.' : 'Encryption identity is not initialized yet.'}</small>{profile?.public_key&&<code className="settings-fingerprint">{ownFingerprint||'Calculating fingerprint…'}</code>}</div></div><div className="feature-row"><LockKeyhole/><div><b>Key storage warning</b><small>Private keys currently use browser localStorage. Do not use sensitive conversations until native secure storage and key recovery are implemented.</small></div></div><div className="feature-row"><LockKeyhole/><div><b>Security status</b><small>Production security audit is required before public launch.</small></div></div></div>}</section></main>;
}
