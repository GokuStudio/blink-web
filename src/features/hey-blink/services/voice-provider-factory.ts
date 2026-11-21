import { env } from '@/config/env';
import { GeminiLiveVoiceSession } from './gemini-live-voice-session';
import { LiveSessionTokenClient } from './live-session-token-client';
import { MockVoiceSession } from './mock-voice-session';
import type { IVoiceSession, VoiceProviderKind } from './voice-session.interface';

export interface VoiceProviderConfig {
  provider: VoiceProviderKind;
  tokenEndpoint: string;
  isLiveConfigured: boolean;
}

/**
 * Resolves the active voice provider without ever silently falling back
 * to simulated audio when live Gemini mode is requested or in production.
 *
 * - Production: always targets `'gemini-live'` (no misleading mock fallback).
 * - Development: honors `VITE_HEY_BLINK_PROVIDER`; if unset, uses `'gemini-live'`
 *   when `VITE_HEY_BLINK_TOKEN_ENDPOINT` is configured, otherwise `'mock'`.
 */
export function resolveVoiceProviderConfig(): VoiceProviderConfig {
  const tokenEndpoint = env.heyBlink.tokenEndpoint;
  const isLiveConfigured = tokenEndpoint.length > 0;

  if (env.isProd) {
    return {
      provider: 'gemini-live',
      tokenEndpoint,
      isLiveConfigured,
    };
  }

  const explicit = env.heyBlink.provider;
  if (explicit === 'gemini-live') {
    return {
      provider: 'gemini-live',
      tokenEndpoint,
      isLiveConfigured,
    };
  }
  if (explicit === 'mock') {
    return {
      provider: 'mock',
      tokenEndpoint,
      isLiveConfigured,
    };
  }

  return {
    provider: isLiveConfigured ? 'gemini-live' : 'mock',
    tokenEndpoint,
    isLiveConfigured,
  };
}

/**
 * Instantiates the explicitly requested voice session provider.
 */
export function createVoiceSessionProvider(
  provider: VoiceProviderKind,
  options?: { tokenEndpoint?: string }
): IVoiceSession {
  if (provider === 'mock') {
    return new MockVoiceSession({ autoCycle: true });
  }

  const endpointUrl = options?.tokenEndpoint ?? env.heyBlink.tokenEndpoint;
  const tokenClient = new LiveSessionTokenClient({ endpointUrl });
  return new GeminiLiveVoiceSession({ tokenClient });
}
