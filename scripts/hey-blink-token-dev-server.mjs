/**
 * Local Development Ephemeral Token Server for Hey Blink (Phase H2)
 *
 * Purpose:
 * Allows testing genuine Gemini Live audio locally WITHOUT placing GEMINI_API_KEY
 * in Vite client bundles or deploying Cloud Functions first.
 *
 * Security:
 * - Binds strictly to 127.0.0.1 (loopback only).
 * - Reads GEMINI_API_KEY exclusively from server-side process.env.
 * - Never logs the API key or minted ephemeral tokens.
 * - Enforces local rate limiting & single-use short-lived ephemeral tokens.
 *
 * Usage (PowerShell):
 *   $env:GEMINI_API_KEY="your-key"
 *   node scripts/hey-blink-token-dev-server.mjs
 *
 * Then set in .env.local:
 *   VITE_HEY_BLINK_PROVIDER=gemini-live
 *   VITE_HEY_BLINK_TOKEN_ENDPOINT=http://127.0.0.1:8787/api/hey-blink/token
 */

import http from 'node:http';
import { GoogleGenAI, Modality, ActivityHandling, ThinkingLevel } from '@google/genai';

const PORT = Number.parseInt(process.env.HEY_BLINK_DEV_TOKEN_PORT || '8787', 10);
const PRIMARY_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview';
const FALLBACK_MODEL =
  process.env.GEMINI_LIVE_FALLBACK_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';
const API_VERSION = process.env.GEMINI_LIVE_API_VERSION || 'v1alpha';
const VOICE_NAME = process.env.HEY_BLINK_VOICE_NAME || 'Aoede';

const ALLOWED_ORIGIN_PREFIXES = ['http://localhost:', 'http://127.0.0.1:'];
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 12;
const requestTimestamps = [];

const SYSTEM_INSTRUCTION = `You are Blink, a warm, calm, intelligent desktop companion built around digital wellness and natural voice conversation.
Speak naturally, concisely, and warmly (1 to 3 short sentences by default unless asked for detail).
Never say "As an AI assistant" or repeat greetings mid-conversation.
Offer practical general screen-use and eye-comfort tips when relevant, but never diagnose medical conditions or invent blink counts, health scores, emails, calendar events, or personal context.
If the user asks about personal integrations that are not connected yet, state clearly and briefly that they are not connected yet.`;

function buildConfig(model) {
  const isGemini3 = model.toLowerCase().includes('gemini-3');
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: VOICE_NAME },
      },
    },
    ...(isGemini3 ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
    realtimeInputConfig: {
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
      automaticActivityDetection: { disabled: false },
    },
    sessionResumption: {},
    contextWindowCompression: { slidingWindow: {} },
  };
}

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGIN_PREFIXES.some((prefix) => origin.startsWith(prefix))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck');
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url !== '/api/hey-blink/token' || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const now = Date.now();
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > RATE_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Local dev token rate limit reached.' }));
    return;
  }
  requestTimestamps.push(now);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'GEMINI_API_KEY is not set in the local dev token server environment.',
      })
    );
    return;
  }

  const expireTime = new Date(now + 15 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(now + 2 * 60 * 1000).toISOString();
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: API_VERSION } });

  const mint = async (modelId) => {
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: modelId,
          config: buildConfig(modelId),
        },
      },
    });
    if (!token.name) throw new Error('Empty ephemeral token returned.');
    return { tokenName: token.name, modelId };
  };

  try {
    let issued;
    try {
      issued = await mint(PRIMARY_MODEL);
    } catch (primaryErr) {
      const msg = primaryErr instanceof Error ? primaryErr.message.toLowerCase() : '';
      if (FALLBACK_MODEL && FALLBACK_MODEL !== PRIMARY_MODEL && (msg.includes('not found') || msg.includes('404') || msg.includes('model'))) {
        console.warn(`[hey-blink-dev-token] Primary model unavailable; trying fallback ${FALLBACK_MODEL}`);
        issued = await mint(FALLBACK_MODEL);
      } else {
        throw primaryErr;
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ephemeralToken: issued.tokenName,
        model: issued.modelId,
        apiVersion: API_VERSION,
        voiceName: VOICE_NAME,
        expiresAt: expireTime,
        newSessionExpiresAt: newSessionExpireTime,
        constraintsLocked: true,
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token creation failed';
    console.error('[hey-blink-dev-token] Token mint failed (credential redacted):', msg);
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unable to mint Gemini Live ephemeral token.' }));
  }
});

if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_API_KEY.trim()) {
  console.error(
    '[hey-blink-dev-token] Refusing to start: GEMINI_API_KEY is not set in this shell environment.'
  );
  console.error(
    '[hey-blink-dev-token] Supply GEMINI_API_KEY securely in your terminal session and re-run.'
  );
  process.exit(1);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[hey-blink-dev-token] Listening on http://127.0.0.1:${PORT}/api/hey-blink/token`);
  console.log(`[hey-blink-dev-token] Model: ${PRIMARY_MODEL} (fallback: ${FALLBACK_MODEL})`);
  console.log('[hey-blink-dev-token] GEMINI_API_KEY configured: true');
});
