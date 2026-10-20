import { describe, it, expect } from 'vitest';
import { parseCallSignal } from './calls';

describe('call signaling validation', () => {
  it('accepts a valid offer with bounded SDP', () => {
    expect(parseCallSignal({ type:'offer', from:'alice', to:'bob', payload:{ type:'offer', sdp:'v=0\r\n' } }, 'alice', 'bob').type).toBe('offer');
  });
  it('rejects unexpected sender and unsupported type', () => {
    expect(() => parseCallSignal({ type:'offer', from:'eve', to:'bob', payload:{type:'offer',sdp:'x'} }, 'alice', 'bob')).toThrow('Unexpected call sender');
    expect(() => parseCallSignal({ type:'magic', from:'alice', to:'bob', payload:{} })).toThrow('Unsupported call signal type');
  });
  it('rejects oversized or malformed session descriptions', () => {
    expect(() => parseCallSignal({ type:'offer', from:'alice', to:'bob', payload:{type:'offer',sdp:'x'.repeat(200001)} })).toThrow('Invalid session description');
    expect(() => parseCallSignal({ type:'answer', from:'alice', to:'bob', payload:{type:'offer'} })).toThrow('Invalid session description');
  });
  it('rejects mismatched SDP types and empty ICE candidates', () => {
    expect(() => parseCallSignal({ type:'answer', from:'alice', to:'bob', payload:{type:'offer',sdp:'v=0'} })).toThrow('Invalid session description');
    expect(() => parseCallSignal({ type:'ice', from:'alice', to:'bob', payload:{candidate:'   '} })).toThrow('Invalid ICE candidate');
  });
  it('rejects malformed ICE and self-calls', () => {
    expect(() => parseCallSignal({ type:'ice', from:'alice', to:'bob', payload:{candidate:'x'.repeat(8193)} })).toThrow('Invalid ICE candidate');
    expect(() => parseCallSignal({ type:'hangup', from:'alice', to:'alice' })).toThrow('Invalid call participants');
  });
});
