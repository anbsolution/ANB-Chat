import { supabase } from './supabase';
export type ChatMessage = { id:string; sender_id:string; recipient_id:string; ciphertext:string; created_at:string; status?:string };
export type RecipientProfile = { id:string; email:string|null; username:string|null; public_key:string|null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CIPHERTEXT_CHARS = 3_000_000;
function assertUserId(value:string, label:string) { if (typeof value !== 'string' || !UUID_RE.test(value)) throw new Error(`Invalid ${label}`); }

export async function findRecipient(query:string): Promise<RecipientProfile> {
  if (!supabase) throw new Error('Configure Supabase first.');
  const raw = query.trim();
  const term = raw.includes('@') ? raw.toLowerCase() : raw.toLowerCase();
  if (!term) throw new Error('Enter an email address or username.');
  const column = term.includes('@') ? 'email' : 'username';
  const { data, error } = await supabase.from('profiles').select('id,email,username,public_key').eq(column, term).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No ANB Chat account found for that email/username.');
  if (!data.public_key) throw new Error('This contact has not registered an encryption key yet.');
  return data as RecipientProfile;
}


/** Fetches a participant's public profile by immutable auth user ID, not by the current recipient search field. */
export async function getProfileById(userId:string): Promise<RecipientProfile> {
  if (!supabase) throw new Error('Configure Supabase first.');
  const { data, error } = await supabase.from('profiles')
    .select('id,email,username,public_key').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Conversation participant profile not found.');
  return data as RecipientProfile;
}

export async function sendEncryptedMessage(recipientId:string, ciphertext:string) {
  assertUserId(recipientId, 'recipient ID');
  if (typeof ciphertext !== 'string' || ciphertext.length === 0 || ciphertext.length > MAX_CIPHERTEXT_CHARS) throw new Error('Invalid encrypted message size.');
  if (!supabase) throw new Error('Configure Supabase first.');
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  const { error } = await supabase.from('messages').insert({ sender_id:user.id, recipient_id:recipientId, ciphertext });
  if (error) throw error;
}

export async function loadConversation(otherUserId:string): Promise<ChatMessage[]> {
  assertUserId(otherUserId, 'conversation participant ID');
  if (!supabase) throw new Error('Configure Supabase first.');
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  const { data,error } = await supabase.from('messages').select('id,sender_id,recipient_id,ciphertext,created_at')
    .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`)
    .order('created_at', { ascending:true });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}


/** Subscribe to incoming messages for the signed-in user. Supabase Realtime must be enabled for public.messages. */
export function subscribeToIncomingMessages(userId:string, onMessage:(message:ChatMessage)=>void) {
  assertUserId(userId, 'user ID');
  if (!supabase) throw new Error('Configure Supabase first.');
  return supabase.channel(`anb-incoming-${userId}`)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`recipient_id=eq.${userId}` }, payload => {
      onMessage(payload.new as ChatMessage);
    })
    .subscribe();
}

/** Subscribe to incoming WebRTC signaling rows. Payloads are untrusted network input and must be validated before use. */
export function subscribeToCallSignals(userId:string, onSignal:(signal:Record<string,unknown>)=>void) {
  assertUserId(userId, 'user ID');
  if (!supabase) throw new Error('Configure Supabase first.');
  return supabase.channel(`anb-call-signals-${userId}`)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'call_signals', filter:`to_user=eq.${userId}` }, payload => {
      onSignal(payload.new as Record<string,unknown>);
    })
    .subscribe();
}


/** Create a signaling row as the authenticated caller. The server RLS policy must remain enabled. */
export async function sendCallSignal(toUser:string, callId:string, signalType:'offer'|'answer'|'ice'|'hangup', payload:unknown = null) {
  if (!supabase) throw new Error('Configure Supabase first.');
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  assertUserId(toUser, 'call recipient ID');
  assertUserId(callId, 'call ID');
  if (toUser === user.id) throw new Error('Invalid call participants or call ID.');
  let payloadSize = 0;
  try { payloadSize = JSON.stringify(payload ?? null).length; } catch { throw new Error('Invalid call payload.'); }
  if (payloadSize > 250_000) throw new Error('Call signaling payload is too large.');
  const { error } = await supabase.from('call_signals').insert({ from_user:user.id, to_user:toUser, call_id:callId, signal_type:signalType, payload });
  if (error) throw error;
}
