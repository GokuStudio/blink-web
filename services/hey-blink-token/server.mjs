/**
 * Hey Blink — Production Cloud Run Ephemeral Token Backend
 *
 * Security controls:
 * 1. Permanent GEMINI_API_KEY mounted strictly server-side from Google Cloud Secret Manager.
 * 2. Cryptographically verifies Firebase Auth ID tokens issued by blink-web-demo-32e0e.
 * 3. Enforces strict CORS & Origin allowlist (approved Blink production + staging URLs only).
 * 4. Enforces per-UID and per-IP sliding-window rate limits + per-UID concurrent session caps.
 * 5. Issues single-use (uses: 1), short-lived (2m open / 15m session) Gemini Live tokens
 *    with server-locked liveConnectConstraints (model, voice, system instruction).
 * 6. Never logs API keys, Authorization headers, or issued ephemeral tokens.
 */

import http from 'node:http';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { ActivityHandling, GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';

const PORT = Number(process.env.PORT || 8080);
const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || 'blink-web-demo-32e0e').trim();
const ALLOW_ANONYMOUS_VOICE_SESSIONS =
  (process.env.ALLOW_ANONYMOUS_VOICE_SESSIONS || 'true').trim().toLowerCase() === 'true';

const PRIMARY_MODEL = (process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview').trim();
const FALLBACK_MODEL = (
  process.env.GEMINI_LIVE_FALLBACK_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025'
).trim();
const API_VERSION = (process.env.GEMINI_LIVE_API_VERSION || 'v1alpha').trim();
const VOICE_NAME = (process.env.HEY_BLINK_VOICE_NAME || 'Aoede').trim();

const NEW_SESSION_TTL_MS = 2 * 60 * 1000; // 2 minutes to open WebSocket
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes max session lifetime
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minute sliding window
const MAX_REQUESTS_PER_UID_WINDOW = Number(process.env.MAX_REQUESTS_PER_UID_WINDOW || 10);
const MAX_REQUESTS_PER_IP_WINDOW = Number(process.env.MAX_REQUESTS_PER_IP_WINDOW || 25);
const MAX_CONCURRENT_SESSIONS_PER_UID = Number(process.env.MAX_CONCURRENT_SESSIONS_PER_UID || 2);

const DEFAULT_ALLOWED_ORIGINS = [
  'https://blink-web-202628474876.asia-south1.run.app',
  'https://blink-web-r6jizqaoya-el.a.run.app',
  'https://hey-blink-test---blink-web-202628474876.asia-south1.run.app',
  'https://hey-blink-test---blink-web-r6jizqaoya-el.a.run.app',
];

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

const HEY_BLINK_SYSTEM_INSTRUCTION = `You are Blink, a warm, calm, intelligent desktop companion built around digital wellness and natural voice conversation.
Speak naturally, concisely, and warmly (1 to 3 short sentences by default unless asked for detail).
Never say "As an AI assistant" or repeat greetings mid-conversation.
Offer practical general screen-use and eye-comfort tips when relevant, but never diagnose medical conditions or invent blink counts, health scores, emails, calendar events, or personal context.
If the user asks about personal integrations that are not connected yet, state clearly and briefly that they are not connected yet.`;

// Initialize Firebase Admin strictly scoped to verify blink-web-demo-32e0e Auth ID tokens via public Google certs
if (getApps().length === 0) {
  initializeApp({ projectId: FIREBASE_PROJECT_ID });
}

const uidRateHistory = new Map();
const ipRateHistory = new Map();
const uidActiveSessions = new Map();

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  const normalized = origin.trim().replace(/\/+$/, '');
  return ALLOWED_ORIGINS.has(normalized);
}

function applySecurityHeaders(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Origin');
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function checkRateAndConcurrency(uid, ip, now) {
  // 1. Per-IP sliding window
  const ipHist = (ipRateHistory.get(ip) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
  if (ipHist.length >= MAX_REQUESTS_PER_IP_WINDOW) {
    ipRateHistory.set(ip, ipHist);
    return {
      ok: false,
      reason: 'Too many voice session requests from this network. Please wait a few minutes.',
    };
  }

  // 2. Per-UID sliding window
  const uidHist = (uidRateHistory.get(uid) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
  if (uidHist.length >= MAX_REQUESTS_PER_UID_WINDOW) {
    uidRateHistory.set(uid, uidHist);
    return {
      ok: false,
      reason: 'Voice session rate limit reached for this account. Please wait a few minutes.',
    };
  }

  // 3. Per-UID concurrent session cap bounded by token TTL
  const active = (uidActiveSessions.get(uid) ?? []).filter((exp) => exp > now);
  if (active.length >= MAX_CONCURRENT_SESSIONS_PER_UID) {
    uidActiveSessions.set(uid, active);
    return {
      ok: false,
      reason: 'Maximum concurrent live voice sessions reached. Please end an active session first.',
    };
  }

  ipHist.push(now);
  uidHist.push(now);
  active.push(now + SESSION_TTL_MS);
  ipRateHistory.set(ip, ipHist);
  uidRateHistory.set(uid, uidHist);
  uidActiveSessions.set(uid, active);
  return { ok: true };
}

function buildLockedLiveConfig(model, voiceName) {
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

function isModelUnavailableError(err) {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('not supported') ||
    msg.includes('404') ||
    msg.includes('model')
  );
}

async function handleMintToken(req, res) {
  const origin = req.headers.origin || '';
  if (!isOriginAllowed(origin)) {
    sendJson(res, 403, { error: 'Origin is not permitted to request Hey Blink voice credentials.' });
    return;
  }

  // Verify Firebase Auth ID token issued by blink-web-demo-32e0e
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    sendJson(res, 401, { error: 'Missing Authorization Bearer Firebase ID token.' });
    return;
  }

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(match[1], false);
  } catch {
    sendJson(res, 401, { error: 'Invalid or expired Firebase authentication token.' });
    return;
  }

  const isAnonymous = decoded.firebase?.sign_in_provider === 'anonymous';
  if (isAnonymous && !ALLOW_ANONYMOUS_VOICE_SESSIONS) {
    sendJson(res, 403, { error: 'Sign in with a verified account to access live voice sessions.' });
    return;
  }

  const now = Date.now();
  const limit = checkRateAndConcurrency(decoded.uid, getClientIp(req), now);
  if (!limit.ok) {
    sendJson(res, 429, { error: limit.reason });
    return;
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    sendJson(res, 503, { error: 'Voice service credentials are not configured.' });
    return;
  }

  const expireTime = new Date(now + SESSION_TTL_MS).toISOString();
  const newSessionExpireTime = new Date(now + NEW_SESSION_TTL_MS).toISOString();

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: API_VERSION },
  });

  const mintForModel = async (modelId) => {
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: modelId,
          config: buildLockedLiveConfig(modelId, VOICE_NAME),
        },
      },
    });
    if (!token?.name) {
      throw new Error('Upstream returned empty ephemeral token.');
    }
    return { tokenName: token.name, modelId };
  };

  try {
    let issued;
    try {
      issued = await mintForModel(PRIMARY_MODEL);
    } catch (primaryErr) {
      if (FALLBACK_MODEL && FALLBACK_MODEL !== PRIMARY_MODEL && isModelUnavailableError(primaryErr)) {
        issued = await mintForModel(FALLBACK_MODEL);
      } else {
        throw primaryErr;
      }
    }

    // Never log apiKey or issued.tokenName
    sendJson(res, 200, {
      ephemeralToken: issued.tokenName,
      model: issued.modelId,
      apiVersion: API_VERSION,
      voiceName: VOICE_NAME,
      expiresAt: expireTime,
      newSessionExpiresAt: newSessionExpireTime,
      constraintsLocked: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (
      msg.includes('quota') ||
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('prepayment') ||
      msg.includes('credits') ||
      msg.includes('billing')
    ) {
      sendJson(res, 429, {
        error: 'Gemini Live quota or billing credits are currently exhausted. Please try again later.',
      });
      return;
    }
    sendJson(res, 503, {
      error: 'Unable to issue a live voice session credential right now.',
    });
  }
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(req, res);
  const urlPath = (req.url || '/').split('?')[0];

  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req.headers.origin || '')) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && urlPath === '/healthz') {
    sendJson(res, 200, {
      ok: true,
      service: 'hey-blink-token',
      firebaseProjectId: FIREBASE_PROJECT_ID,
      model: PRIMARY_MODEL,
      hasApiKey: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    });
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/hey-blink/token') {
    await handleMintToken(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    JSON.stringify({
      event: 'hey_blink_token_service_started',
      port: PORT,
      firebaseProjectId: FIREBASE_PROJECT_ID,
      primaryModel: PRIMARY_MODEL,
      allowedOriginsCount: ALLOWED_ORIGINS.size,
      hasApiKey: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    })
  );
});
