export type CallSignal = { type:'offer'|'answer'|'ice'|'hangup'; from:string; to:string; payload?: RTCSessionDescriptionInit | RTCIceCandidateInit | null; created_at?:string };
export function rtcConfiguration(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [{ urls:'stun:stun.l.google.com:19302' }];
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;
  if (turnUrl && turnUsername && turnCredential) iceServers.push({ urls:turnUrl, username:turnUsername, credential:turnCredential });
  return { iceServers, bundlePolicy:'max-bundle' };
}
export async function getMedia(kind:'audio'|'video'): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera/microphone access is unavailable. Use HTTPS or the native app.');
  return navigator.mediaDevices.getUserMedia({ audio:true, video:kind==='video' });
}


/** Validate untrusted call-signaling data before passing it to RTCPeerConnection. */
export function parseCallSignal(value: unknown, expectedFrom?: string, expectedTo?: string): CallSignal {
  if (!value || typeof value !== 'object') throw new Error('Invalid call signal');
  const v = value as Record<string, unknown>;
  const allowed = ['offer', 'answer', 'ice', 'hangup'] as const;
  if (typeof v.type !== 'string' || !allowed.includes(v.type as typeof allowed[number])) throw new Error('Unsupported call signal type');
  if (typeof v.from !== 'string' || !v.from || typeof v.to !== 'string' || !v.to || v.from === v.to) throw new Error('Invalid call participants');
  if (expectedFrom && v.from !== expectedFrom) throw new Error('Unexpected call sender');
  if (expectedTo && v.to !== expectedTo) throw new Error('Unexpected call recipient');
  if (v.type !== 'hangup' && (!v.payload || typeof v.payload !== 'object')) throw new Error('Missing call payload');
  if (v.type === 'offer' || v.type === 'answer') {
    const payload = v.payload as Record<string, unknown>;
    if (payload.type !== v.type || typeof payload.sdp !== 'string' || payload.sdp.trim().length === 0 || payload.sdp.length > 200_000) throw new Error('Invalid session description');
  }
  if (v.type === 'ice') {
    const payload = v.payload as Record<string, unknown>;
    if (typeof payload.candidate !== 'string' || payload.candidate.trim().length === 0 || payload.candidate.length > 8_192) throw new Error('Invalid ICE candidate');
    if (payload.sdpMid !== undefined && payload.sdpMid !== null && typeof payload.sdpMid !== 'string') throw new Error('Invalid ICE candidate');
    if (payload.sdpMLineIndex !== undefined && payload.sdpMLineIndex !== null && (!Number.isInteger(payload.sdpMLineIndex) || (payload.sdpMLineIndex as number) < 0)) throw new Error('Invalid ICE candidate');
  }
  return v as unknown as CallSignal;
}
