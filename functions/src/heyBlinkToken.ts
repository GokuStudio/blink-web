import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
  ActivityHandling,
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  type LiveConnectConfig,
} from '@google/genai';

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Managed Google Cloud Secret Manager binding.
 * Never store GEMINI_API_KEY in source code, git commits, or Vite VITE_* variables.
 * Set via: `firebase functions:secrets:set GEMINI_API_KEY`
 */
const geminiApiKeySecret = defineSecret('GEMINI_API_KEY');

const DEFAULT_PRIMARY_MODEL = 'gemini-3.1-flash-live-preview';
const DEFAULT_FALLBACK_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const DEFAULT_API_VERSION = 'v1alpha';
const DEFAULT_VOICE_NAME = 'Aoede';

const NEW_SESSION_TTL_MS = 2 * 60 * 1000; // 2 minutes to open a session
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes max token lifetime
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minute sliding window
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_CONCURRENT_SESSIONS_PER_USER = 2;

const HEY_BLINK_SYSTEM_INSTRUCTION = `You are Blink, a warm, calm, intelligent desktop companion built around digital wellness and natural voice conversation.
Speak naturally, concisely, and warmly (1 to 3 short sentences by default unless asked for detail).
Never say "As an AI assistant" or repeat greetings mid-conversation.
Offer practical general screen-use and eye-comfort tips when relevant, but never diagnose medical conditions or invent blink counts, health scores, emails, calendar events, or personal context.
If the user asks about personal integrations that are not connected yet, state clearly and briefly that they are not connected yet.`;

// Per-instance rate-limit & concurrency guard (supplement with Firestore/Redis for multi-instance scale)
const userRateHistory = new Map<string, number[]>();
const userActiveSessions = new Map<string, number[]>();

function pruneAndCheckLimits(uid: string, now: number): { ok: true } | { ok: false; reason: string } {
  // 1. Sliding window request rate limit
  const history = (userRateHistory.get(uid) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
  if (history.length >= MAX_REQUESTS_PER_WINDOW) {
    userRateHistory.set(uid, history);
    return {
      ok: false,
      reason: 'Rate limit exceeded. Wait a few minutes before starting another live voice session.',
    };
  }

  // 2. Concurrent session cap (bounded by token TTL)
  const active = (userActiveSessions.get(uid) ?? []).filter((exp) => exp > now);
  if (active.length >= MAX_CONCURRENT_SESSIONS_PER_USER) {
    userActiveSessions.set(uid, active);
    return {
      ok: false,
      reason: 'Maximum concurrent live voice sessions reached for this account.',
    };
  }

  history.push(now);
  active.push(now + SESSION_TTL_MS);
  userRateHistory.set(uid, history);
  userActiveSessions.set(uid, active);
  return { ok: true };
}

function buildLockedLiveConfig(model: string, voiceName: string): LiveConnectConfig {
  const isGemini3 = model.toLowerCase().includes('gemini-3');
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: {
      parts: [{ text: HEY_BLINK_SYSTEM_INSTRUCTION }],
    },
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName,
        },
      },
    },
    ...(isGemini3
      ? {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
        }
      : {}),
    realtimeInputConfig: {
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
      automaticActivityDetection: {
        disabled: false,
      },
    },
    sessionResumption: {},
    contextWindowCompression: {
      slidingWindow: {},
    },
  };
}

function isModelUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('not supported') ||
    msg.includes('404') ||
    msg.includes('model')
  );
}

/**
 * Trusted HTTPS Cloud Function v2 issuing short-lived Gemini Live ephemeral tokens.
 *
 * Security controls:
 * 1. Verifies Firebase Auth ID token server-side.
 * 2. Rejects anonymous auth by default in production (requires non-anonymous auth or explicit dev flag).
 * 3. Verifies Firebase App Check token when enabled (`ENFORCE_APP_CHECK=true`).
 * 4. Applies per-user rate limiting & concurrent session limits.
 * 5. Locks model, voice, and system instruction inside `liveConnectConstraints`.
 * 6. Never logs ephemeral tokens, API keys, or user audio.
 */
export const mintHeyBlinkLiveToken = onRequest(
  {
    region: 'us-central1',
    secrets: [geminiApiKeySecret],
    cors: true,
    maxInstances: 20,
    timeoutSeconds: 15,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed. Use POST.' });
      return;
    }

    // 1. Optional/Production Firebase App Check verification
    const enforceAppCheck = process.env.ENFORCE_APP_CHECK === 'true';
    if (enforceAppCheck) {
      const appCheckHeader = req.header('X-Firebase-AppCheck');
      if (!appCheckHeader) {
        res.status(401).json({ error: 'App Check token is required.' });
        return;
      }
      try {
        await getAppCheck().verifyToken(appCheckHeader);
      } catch {
        res.status(401).json({ error: 'Invalid App Check token.' });
        return;
      }
    }

    // 2. Verify Firebase Auth ID token
    const authHeader = req.header('Authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ error: 'Missing Authorization Bearer ID token.' });
      return;
    }

    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await getAuth().verifyIdToken(match[1], true);
    } catch {
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
      return;
    }

    // 3. Enforce non-anonymous identity for billable live AI tokens unless explicitly enabled for controlled dev
    const isAnonymous = decodedToken.firebase?.sign_in_provider === 'anonymous';
    const allowAnonymousDev = process.env.ALLOW_ANONYMOUS_VOICE_DEV === 'true';
    if (isAnonymous && !allowAnonymousDev) {
      res.status(403).json({
        error: 'Sign in with a verified account to access live Gemini voice sessions.',
      });
      return;
    }

    // 4. Rate limiting & concurrent session caps
    const now = Date.now();
    const limitResult = pruneAndCheckLimits(decodedToken.uid, now);
    if (!limitResult.ok) {
      res.status(429).json({ error: limitResult.reason });
      return;
    }

    const apiKey = geminiApiKeySecret.value();
    if (!apiKey) {
      res.status(503).json({ error: 'Voice service credentials are not configured.' });
      return;
    }

    const primaryModel = process.env.GEMINI_LIVE_MODEL || DEFAULT_PRIMARY_MODEL;
    const fallbackModel = process.env.GEMINI_LIVE_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
    const apiVersion = process.env.GEMINI_LIVE_API_VERSION || DEFAULT_API_VERSION;
    const voiceName = process.env.HEY_BLINK_VOICE_NAME || DEFAULT_VOICE_NAME;

    const expireTime = new Date(now + SESSION_TTL_MS).toISOString();
    const newSessionExpireTime = new Date(now + NEW_SESSION_TTL_MS).toISOString();

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion },
    });

    const mintForModel = async (modelId: string) => {
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime,
          newSessionExpireTime,
          liveConnectConstraints: {
            model: modelId,
            config: buildLockedLiveConfig(modelId, voiceName),
          },
        },
      });
      if (!token.name) {
        throw new Error('Provider returned empty ephemeral token.');
      }
      return { tokenName: token.name, modelId };
    };

    try {
      let issued: { tokenName: string; modelId: string };
      try {
        issued = await mintForModel(primaryModel);
      } catch (primaryErr) {
        if (fallbackModel && fallbackModel !== primaryModel && isModelUnavailableError(primaryErr)) {
          issued = await mintForModel(fallbackModel);
        } else {
          throw primaryErr;
        }
      }

      // Return ONLY client-facing token metadata — never log tokenName or apiKey
      res.status(200).json({
        ephemeralToken: issued.tokenName,
        model: issued.modelId,
        apiVersion,
        voiceName,
        expiresAt: expireTime,
        newSessionExpiresAt: newSessionExpireTime,
        constraintsLocked: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('quota') || msg.includes('429') || msg.includes('resource_exhausted')) {
        res.status(429).json({
          error: 'Gemini Live quota temporarily exhausted. Please try again later.',
        });
        return;
      }
      res.status(503).json({
        error: 'Unable to issue a live voice session credential right now.',
      });
    }
  }
);
