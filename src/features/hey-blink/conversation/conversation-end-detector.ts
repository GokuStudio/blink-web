/**
 * Hey Blink — Two-Layer Natural Conversation End Detector (Phase H2.5)
 *
 * Layer A — High-confidence local intent detection:
 *   Recognizes explicit closing utterances on finalized user speech while strictly
 *   rejecting partial transcripts, isolated ambiguous words, questions, quotations,
 *   writing instructions, and negations.
 *
 * Layer B — Gemini-assisted structured end-intent validator:
 *   Validates an explicit structured `end_conversation` signal (e.g. tool call)
 *   against the active session ID and recent finalized user turn without executing
 *   arbitrary assistant prose or issuing an extra paid API call per turn.
 */

export type EndIntentLayer = 'local_high_confidence' | 'gemini_structured' | 'none';

export interface EndIntentEvaluation {
  shouldEnd: boolean;
  layer: EndIntentLayer;
  confidence: number;
  normalizedText: string;
  matchedPattern?: string;
  rejectionReason?: string;
}

export interface StructuredEndConversationSignal {
  /** Must match the currently active session ID */
  sessionId: string;
  /** Optional model-supplied reason */
  reason?: string;
  /** Confidence 0..1 */
  confidence?: number;
  /** Timestamp of signal arrival (Date.now()) */
  receivedAtMs?: number;
}

export interface EndValidatorContext {
  activeSessionId: string | null;
  lastFinalUserTranscript: string | null;
  lastFinalUserTranscriptAtMs: number | null;
}

/**
 * Normalizes casing, curly apostrophes/quotes, punctuation, and extra whitespace.
 */
export function normalizeUtterance(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[.!?,;:\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Patterns that indicate the user is asking about, quoting, drafting, or negating
 * a closing phrase — MUST NEVER terminate the conversation.
 */
const REJECTION_CONTEXT_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  // Negations & explicit requests to continue
  {
    name: 'negation_or_continuation',
    regex:
      /\b(don'?t|do not|never|not|stop trying to|wait|hold on)\b.*\b(end|stop|close|leave|go|quit|exit|done|finished|listening)\b|\b(not done|not finished|one more thing|keep listening|stay on|don'?t go)\b/i,
  },
  // Questions about words/translations/meanings
  {
    name: 'question_context',
    regex:
      /^(how|what|why|when|where|who|which|is|are|was|were|do|does|did|can|could|would|should|translate|define|spell)\b/i,
  },
  // Writing / drafting / email / message composition contexts
  {
    name: 'composition_context',
    regex:
      /\b(write|draft|compose|send|create|make|format|reply|sign off)\b.*\b(email|mail|message|letter|note|text|slack|ending|saying|with)\b/i,
  },
  // Reported speech / quotations ("My colleague said that's all", "She told me bye")
  {
    name: 'reported_speech_or_quote',
    regex:
      /\b(he|she|they|someone|colleague|boss|friend|manager|client|customer|it)\b.*\b(said|told|asked|replied|wrote|texted|meant)\b|\b(in (japanese|spanish|french|german|hindi|tamil|chinese|korean|italian|arabic|portuguese|english))\b/i,
  },
];

/**
 * High-confidence full-utterance closing patterns.
 * Anchored to the full normalized utterance (`^...$`) so stray substrings buried
 * inside longer normal questions never cause accidental termination.
 */
const FULL_UTTERANCE_CLOSING_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  // "Okay Blink, that's all" / "Thanks Blink, that's all for now" / "Thank you, that's all I needed"
  {
    name: 'thats_all',
    regex:
      /^(?:(?:ok|okay|alright|all right|thanks|thank you|cool|great|awesome|perfect|got it)(?:\s+blink)?\s+)?that'?s\s+(?:all|it|everything)(?:\s+(?:i\s+needed|for\s+now|for\s+today))?(?:\s+blink)?(?:\s+(?:thanks|thank you|bye|goodbye))?$/,
  },
  // "Thanks Blink, bye" / "Okay bye Blink" / "Goodbye Blink" / "Bye for now"
  {
    name: 'explicit_farewell',
    regex:
      /^(?:(?:ok|okay|alright|all right|thanks|thank you|cool|great|all good)(?:\s+blink)?\s+)?(?:goodbye|good bye|bye bye|bye|goodnight|good night|see you(?: later| soon)?|catch you later|talk to you later|speak to you later)(?:\s+for\s+now)?(?:\s+blink)?$/,
  },
  // "Blink, goodbye" / "Blink, that's all"
  {
    name: 'addressed_blink_closing',
    regex:
      /^(?:hey\s+)?blink\s+(?:(?:ok|okay|thanks|thank you)\s+)?(?:goodbye|good bye|bye|bye bye|that'?s\s+(?:all|it)(?:\s+(?:for\s+now|i\s+needed))?|we'?re\s+done(?:\s+for\s+now)?|i'?m\s+done(?:\s+for\s+now)?|all\s+done|talk\s+to\s+you\s+later|see\s+you(?:\s+later|\s+soon)?)$/,
  },
  // "You can stop listening now" / "Stop listening Blink" / "End the conversation"
  {
    name: 'explicit_stop_listening',
    regex:
      /^(?:(?:ok|okay|thanks|thank you|please)(?:\s+blink)?\s+)?(?:you\s+can\s+)?(?:stop\s+listening|go\s+back\s+to\s+sleep|go\s+to\s+sleep|end\s+(?:the\s+)?(?:conversation|session|chat)|close\s+(?:the\s+)?(?:conversation|session))(?:\s+now)?(?:\s+blink)?(?:\s+please)?$/,
  },
  // "I'm done for now" / "We're done, thanks" / "All done Blink"
  {
    name: 'explicit_done',
    regex:
      /^(?:(?:ok|okay|alright|thanks|thank you)(?:\s+blink)?\s+)?(?:i'?m|we'?re|i\s+am|we\s+are|all)\s+(?:done|finished|good)(?:\s+(?:for\s+now|talking|here))?(?:\s+blink)?(?:\s+(?:thanks|thank you|bye|goodbye))?$/,
  },
];

/**
 * Isolated single words that must NEVER end a session on their own.
 */
const ISOLATED_AMBIGUOUS_WORDS = new Set([
  'ok',
  'okay',
  'thanks',
  'thank',
  'stop',
  'done',
  'all',
  'good',
  'cool',
  'great',
  'yes',
  'no',
  'blink',
  'hey',
]);

export class ConversationEndDetector {
  private readonly structuredSignalMaxAgeMs: number;

  constructor(options?: { structuredSignalMaxAgeMs?: number }) {
    this.structuredSignalMaxAgeMs = options?.structuredSignalMaxAgeMs ?? 12_000;
  }

  /**
   * Layer A: Evaluate a user speech transcript locally with high precision.
   */
  public evaluateUserTranscript(rawTranscript: string, isFinal: boolean): EndIntentEvaluation {
    const normalized = normalizeUtterance(rawTranscript);

    if (!isFinal) {
      return {
        shouldEnd: false,
        layer: 'none',
        confidence: 0,
        normalizedText: normalized,
        rejectionReason: 'partial_transcript',
      };
    }

    if (!normalized) {
      return {
        shouldEnd: false,
        layer: 'none',
        confidence: 0,
        normalizedText: normalized,
        rejectionReason: 'empty_transcript',
      };
    }

    // Reject explicit question punctuation ("Goodbye?", "Is goodbye one word?")
    if (rawTranscript.trim().endsWith('?')) {
      return {
        shouldEnd: false,
        layer: 'none',
        confidence: 0,
        normalizedText: normalized,
        rejectionReason: 'question_mark',
      };
    }

    // Reject explicit quoted text containing closing phrases
    if (/["“”].*(bye|goodbye|that'?s all|thank you|stop listening).*["“”]/i.test(rawTranscript)) {
      return {
        shouldEnd: false,
        layer: 'none',
        confidence: 0,
        normalizedText: normalized,
        rejectionReason: 'quoted_phrase',
      };
    }

    // Reject isolated ambiguous words
    if (ISOLATED_AMBIGUOUS_WORDS.has(normalized)) {
      return {
        shouldEnd: false,
        layer: 'none',
        confidence: 0,
        normalizedText: normalized,
        rejectionReason: 'isolated_ambiguous_word',
      };
    }

    // Reject non-ending semantic contexts (negations, questions, compositions, reported speech)
    for (const rule of REJECTION_CONTEXT_PATTERNS) {
      if (rule.regex.test(normalized)) {
        return {
          shouldEnd: false,
          layer: 'none',
          confidence: 0,
          normalizedText: normalized,
          rejectionReason: rule.name,
        };
      }
    }

    // Match high-confidence full-utterance closing patterns
    for (const pattern of FULL_UTTERANCE_CLOSING_PATTERNS) {
      if (pattern.regex.test(normalized)) {
        return {
          shouldEnd: true,
          layer: 'local_high_confidence',
          confidence: 0.96,
          normalizedText: normalized,
          matchedPattern: pattern.name,
        };
      }
    }

    return {
      shouldEnd: false,
      layer: 'none',
      confidence: 0,
      normalizedText: normalized,
      rejectionReason: 'no_closing_match',
    };
  }

  /**
   * Layer B: Validate a Gemini-assisted structured `end_conversation` tool/intent signal.
   * Rejects stale session IDs, signals without a recent user turn, or signals whose
   * corresponding user turn was actually a question/negation/quotation.
   *
   * Never accepts free-form Gemini assistant text (e.g. Gemini saying "Goodbye" alone).
   */
  public validateStructuredEndSignal(
    signal: StructuredEndConversationSignal,
    context: EndValidatorContext
  ): EndIntentEvaluation {
    const now = signal.receivedAtMs ?? Date.now();

    if (!context.activeSessionId || signal.sessionId !== context.activeSessionId) {
      return {
        shouldEnd: false,
        layer: 'none',
        confidence: 0,
        normalizedText: '',
        rejectionReason: 'session_id_mismatch',
      };
    }

    if (
      !context.lastFinalUserTranscript ||
      context.lastFinalUserTranscriptAtMs === null ||
      now - context.lastFinalUserTranscriptAtMs > this.structuredSignalMaxAgeMs
    ) {
      return {
        shouldEnd: false,
        layer: 'none',
        confidence: 0,
        normalizedText: normalizeUtterance(context.lastFinalUserTranscript ?? ''),
        rejectionReason: 'no_recent_user_turn',
      };
    }

    const rawUser = context.lastFinalUserTranscript;
    const normalized = normalizeUtterance(rawUser);

    if (rawUser.trim().endsWith('?')) {
      return {
        shouldEnd: false,
        layer: 'none',
        confidence: 0,
        normalizedText: normalized,
        rejectionReason: 'user_turn_was_question',
      };
    }

    for (const rule of REJECTION_CONTEXT_PATTERNS) {
      if (rule.regex.test(normalized)) {
        return {
          shouldEnd: false,
          layer: 'none',
          confidence: 0,
          normalizedText: normalized,
          rejectionReason: `structured_rejected:${rule.name}`,
        };
      }
    }

    const confidence = signal.confidence ?? 0.85;
    if (confidence < 0.7) {
      return {
        shouldEnd: false,
        layer: 'none',
        confidence,
        normalizedText: normalized,
        rejectionReason: 'low_confidence',
      };
    }

    return {
      shouldEnd: true,
      layer: 'gemini_structured',
      confidence,
      normalizedText: normalized,
      matchedPattern: signal.reason || 'structured_end_conversation',
    };
  }
}
