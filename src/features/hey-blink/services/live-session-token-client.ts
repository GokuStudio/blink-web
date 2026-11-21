import { getFirebaseServices } from '@/shared/firebase/client';
import type { VoiceSessionErrorCode } from './voice-session.interface';

export interface LiveSessionTokenResponse {
  /** Short-lived Gemini Live ephemeral token (e.g. `auth_tokens/...`) */
  ephemeralToken: string;
  /** Server-selected Gemini Live model ID */
  model: string;
  /** API version matching token issuance (`v1alpha` or `v1beta`) */
  apiVersion: string;
  /** ISO-8601 timestamp when active session messages expire */
  expiresAt: string;
  /** ISO-8601 timestamp after which new sessions cannot be opened with this token */
  newSessionExpiresAt: string;
  /** Server-selected voice name */
  voiceName?: string;
  /** Whether the token locks `liveConnectConstraints` server-side */
  constraintsLocked?: boolean;
}

export class LiveSessionTokenError extends Error {
  public readonly code: VoiceSessionErrorCode;
  public readonly status: number | null;
  public readonly recoverable: boolean;

  constructor(
    code: VoiceSessionErrorCode,
    message: string,
    status: number | null = null,
    recoverable = true
  ) {
    super(message);
    this.name = 'LiveSessionTokenError';
    this.code = code;
    this.status = status;
    this.recoverable = recoverable;
  }
}

export interface LiveSessionTokenClientOptions {
  /** Trusted backend endpoint URL that mints Gemini Live ephemeral tokens */
  endpointUrl: string;
  /** Optional Firebase App Check token provider for production abuse protection */
  getAppCheckToken?: () => Promise<string | null>;
  /** Optional custom auth header provider (defaults to Firebase Auth ID token) */
  getAuthIdToken?: () => Promise<string | null>;
  /** Custom fetch implementation for testing */
  fetchFn?: typeof fetch;
  /** Request timeout in milliseconds (default 10000 ms) */
  timeoutMs?: number;
}

async function defaultGetFirebaseIdToken(): Promise<string | null> {
  try {
    const services = getFirebaseServices();
    const user = services.auth?.currentUser;
    if (!user || typeof user.getIdToken !== 'function') {
      return null;
    }
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Trusted backend token client for Gemini Live ephemeral credentials.
 *
 * Security invariants:
 * - Never holds or transmits a long-lived Gemini API key in browser code.
 * - Never logs returned ephemeral tokens.
 * - Never silently falls back to mock audio on credential/network failures.
 */
export class LiveSessionTokenClient {
  private readonly endpointUrl: string;
  private readonly getAuthIdToken: () => Promise<string | null>;
  private readonly getAppCheckToken?: () => Promise<string | null>;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: LiveSessionTokenClientOptions) {
    this.endpointUrl = options.endpointUrl.trim();
    this.getAuthIdToken = options.getAuthIdToken ?? defaultGetFirebaseIdToken;
    this.getAppCheckToken = options.getAppCheckToken;
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  public isConfigured(): boolean {
    return this.endpointUrl.length > 0;
  }

  public async requestToken(params?: {
    resuming?: boolean;
    sessionId?: string | null;
  }): Promise<LiveSessionTokenResponse> {
    if (!this.isConfigured()) {
      throw new LiveSessionTokenError(
        'SESSION_INIT_FAILED',
        'Live voice token service is not configured. Configure VITE_HEY_BLINK_TOKEN_ENDPOINT or switch to Mock mode in DEV.',
        null,
        false
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const idToken = await this.getAuthIdToken();
    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    if (this.getAppCheckToken) {
      const appCheckToken = await this.getAppCheckToken();
      if (appCheckToken) {
        headers['X-Firebase-AppCheck'] = appCheckToken;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(this.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resuming: Boolean(params?.resuming),
          clientSessionId: params?.sessionId ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let serverMessage = '';
        try {
          const errJson = (await response.json()) as { error?: string; message?: string };
          serverMessage = errJson.message || errJson.error || '';
        } catch {
          // Ignore non-JSON error body
        }

        if (response.status === 401 || response.status === 403) {
          throw new LiveSessionTokenError(
            'SESSION_INIT_FAILED',
            serverMessage || 'Authentication is required to start a live voice session.',
            response.status,
            false
          );
        }
        if (response.status === 429) {
          throw new LiveSessionTokenError(
            'SESSION_INIT_FAILED',
            serverMessage || 'Voice session rate limit reached. Wait a moment and try again.',
            response.status,
            true
          );
        }
        if (response.status >= 500) {
          throw new LiveSessionTokenError(
            'NETWORK_UNAVAILABLE',
            serverMessage || 'The live voice token service is temporarily unavailable.',
            response.status,
            true
          );
        }

        throw new LiveSessionTokenError(
          'SESSION_INIT_FAILED',
          serverMessage || `Live voice token request failed (HTTP ${response.status}).`,
          response.status,
          true
        );
      }

      const payload = (await response.json()) as Partial<LiveSessionTokenResponse>;
      if (!payload.ephemeralToken || !payload.model) {
        throw new LiveSessionTokenError(
          'SESSION_INIT_FAILED',
          'Token endpoint returned an incomplete credential response.',
          response.status,
          false
        );
      }

      return {
        ephemeralToken: payload.ephemeralToken,
        model: payload.model,
        apiVersion: payload.apiVersion || 'v1alpha',
        expiresAt: payload.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        newSessionExpiresAt:
          payload.newSessionExpiresAt || new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        voiceName: payload.voiceName,
        constraintsLocked: Boolean(payload.constraintsLocked),
      };
    } catch (err) {
      if (err instanceof LiveSessionTokenError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LiveSessionTokenError(
          'NETWORK_UNAVAILABLE',
          'Timed out connecting to the live voice authentication service.',
          null,
          true
        );
      }
      throw new LiveSessionTokenError(
        'NETWORK_UNAVAILABLE',
        'Could not reach the live voice authentication service. Check your connection.',
        null,
        true
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
