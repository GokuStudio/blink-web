export type DestinationId = 'home' | 'insights' | 'settings' | 'assistant';

export type CompanionWellnessState =
  | 'focus_drift'
  | 'healthy'
  | 'break_due'
  | 'paused'
  | 'disconnected';

export type TimeRangeId = 'today' | '7d' | '30d';

export type ComfortChoice = 'fresh' | 'tired' | 'strained';

export type AssistantPhase = 'idle' | 'listening' | 'thinking' | 'responding';

export interface WellnessStateProfile {
  id: CompanionWellnessState;
  shortLabel: string;
  rateDisplay: string;
  numericRate: number | null;
  baseline: number;
  deltaLabel: string;
  headline: string;
  guidance: string;
  ctaLabel: string;
  ctaSecondary: string;
  accentHex: string;
  blinkIntervalMs: number;
  activeTicks: number; // out of 20
}

export interface RhythmSample {
  id: string;
  label: string;
  time: string;
  rate: number | null; // null = tracking paused
  context: string;
  zone: 'steady' | 'dip' | 'paused';
}

export interface DaySummaryBar {
  day: string;
  avg: number;
  breaks: number;
}

export interface InsightsDataset {
  id: TimeRangeId;
  label: string;
  avgRate: number;
  baseline: number;
  deltaPercent: number;
  summaryHeadline: string;
  patternTitle: string;
  patternBody: string;
  samples: RhythmSample[];
  weeklyBars: DaySummaryBar[];
  maxOpenGaze: string;
  observedTime: string;
  coverage: string;
  breaksCompleted: number;
  breaksTarget: number;
  nextPause: string;
}

export interface MemoryItem {
  id: string;
  group: 'Today' | 'Earlier';
  title: string;
  time: string;
  summary: string;
  metricTag: string;
  kind: 'voice' | 'schedule' | 'sensor' | 'hardware';
  messages: Array<{
    from: 'user' | 'blink';
    time: string;
    text: string;
  }>;
}

export interface DerivedBlinkZone {
  id: 'offline' | 'paused' | 'low' | 'below' | 'healthy' | 'brisk';
  shortLabel: string;
  subLabel: string;
  headline: string;
  guidance: string;
  ctaLabel: string;
  ctaSecondary: string;
  accentHex: string;
  ambientRgb: string;
  segmentTint: string;
}

/**
 * Automatically derives visual tone, copy, and status strictly from the user's
 * blink rate count (plus hardware pause/offline state) — never manual modes.
 */
export function deriveBlinkZone(
  blinkRate: number,
  paused: boolean,
  connected: boolean,
  baseline = 17
): DerivedBlinkZone {
  if (!connected) {
    return {
      id: 'offline',
      shortLabel: 'Offline',
      subLabel: 'Node away',
      headline: 'Desk Node 01 is away.',
      guidance: 'Wake or reconnect your companion when you return to your desk.',
      ctaLabel: 'Reconnect Node 01',
      ctaSecondary: 'Device Setup',
      accentHex: '#7A827D',
      ambientRgb: '122, 130, 125',
      segmentTint: 'rgba(255, 255, 255, 0.14)',
    };
  }

  if (paused || blinkRate <= 0) {
    return {
      id: 'paused',
      shortLabel: 'Paused',
      subLabel: 'Tracking paused',
      headline: 'Blink is resting quietly.',
      guidance: 'No blink activity is being recorded while paused.',
      ctaLabel: 'Resume Observation',
      ctaSecondary: 'Settings',
      accentHex: '#8C938E',
      ambientRgb: '140, 147, 142',
      segmentTint: 'rgba(255, 255, 255, 0.14)',
    };
  }

  if (blinkRate <= 9) {
    return {
      id: 'low',
      shortLabel: 'Low Cadence',
      subLabel: 'Low blink rate',
      headline: 'Time for a quiet horizon break.',
      guidance: `At ${blinkRate}/min (${baseline - blinkRate} below usual), a brief 20s look away eases screen lock.`,
      ctaLabel: 'Begin 20s Rest',
      ctaSecondary: 'Snooze 10m',
      accentHex: '#E8644F',
      ambientRgb: '232, 100, 79',
      segmentTint: 'rgba(232, 100, 79, 0.34)',
    };
  }

  if (blinkRate <= 14) {
    return {
      id: 'below',
      shortLabel: 'Below Usual',
      subLabel: 'Below usual',
      headline: 'Your eyes could use a moment.',
      guidance: 'Cadence slowed during 48m of continuous focus.',
      ctaLabel: 'Take a 20s Rest',
      ctaSecondary: 'Later',
      accentHex: '#F0B45A',
      ambientRgb: '240, 180, 90',
      segmentTint: 'rgba(240, 180, 90, 0.32)',
    };
  }

  if (blinkRate <= 20) {
    return {
      id: 'healthy',
      shortLabel: 'In Rhythm',
      subLabel: 'Healthy rhythm',
      headline: 'Calm, steady visual rhythm.',
      guidance: 'Consistent blink cadence with comfortable gaze intervals.',
      ctaLabel: 'Start 20s Reset',
      ctaSecondary: 'Insights',
      accentHex: '#A6FA4C',
      ambientRgb: '166, 250, 76',
      segmentTint: 'rgba(166, 250, 76, 0.3)',
    };
  }

  return {
    id: 'brisk',
    shortLabel: 'Brisk Cadence',
    subLabel: 'Brisk rhythm',
    headline: 'Elevated blink activity.',
    guidance: 'Faster than your usual pace — check room glare or dryness.',
    ctaLabel: 'Start 20s Reset',
    ctaSecondary: 'Insights',
    accentHex: '#6CE8B8',
    ambientRgb: '108, 232, 184',
    segmentTint: 'rgba(108, 232, 184, 0.3)',
  };
}

/**
 * Seeded demonstration profiles illustrating Blink's 5 live wellness & hardware states.
 * All readings are local prototype values — never live clinical measurements.
 */
export const WELLNESS_PROFILES: Record<CompanionWellnessState, WellnessStateProfile> = {
  focus_drift: {
    id: 'focus_drift',
    shortLabel: 'Focus Drift',
    rateDisplay: '13',
    numericRate: 13,
    baseline: 17,
    deltaLabel: '4 below your usual 17',
    headline: 'Your eyes could use a moment.',
    guidance: 'Cadence slowed during 48m of continuous focus.',
    ctaLabel: 'Take a 20s Rest',
    ctaSecondary: 'Later',
    accentHex: '#F0B45A',
    blinkIntervalMs: 4600,
    activeTicks: 11,
  },
  healthy: {
    id: 'healthy',
    shortLabel: 'In Rhythm',
    rateDisplay: '18',
    numericRate: 18,
    baseline: 17,
    deltaLabel: 'Aligned with your usual 17',
    headline: 'Calm, steady visual rhythm.',
    guidance: 'Consistent blink cadence with comfortable gaze intervals.',
    ctaLabel: 'Start 20s Reset',
    ctaSecondary: 'Insights',
    accentHex: '#A6FA4C',
    blinkIntervalMs: 3100,
    activeTicks: 16,
  },
  break_due: {
    id: 'break_due',
    shortLabel: 'Break Due',
    rateDisplay: '11',
    numericRate: 11,
    baseline: 17,
    deltaLabel: '6 below usual · 38m since break',
    headline: 'Time for a quiet horizon break.',
    guidance: 'A brief 20-second look into the distance eases screen lock.',
    ctaLabel: 'Begin 20s Rest',
    ctaSecondary: 'Snooze 10m',
    accentHex: '#A6FA4C',
    blinkIntervalMs: 5400,
    activeTicks: 8,
  },
  paused: {
    id: 'paused',
    shortLabel: 'Paused',
    rateDisplay: '—',
    numericRate: null,
    baseline: 17,
    deltaLabel: 'Optical observation paused',
    headline: 'Blink is resting quietly.',
    guidance: 'No blink activity is being recorded while paused.',
    ctaLabel: 'Resume Observation',
    ctaSecondary: 'Settings',
    accentHex: '#8C938E',
    blinkIntervalMs: 0,
    activeTicks: 0,
  },
  disconnected: {
    id: 'disconnected',
    shortLabel: 'Offline',
    rateDisplay: '—',
    numericRate: null,
    baseline: 17,
    deltaLabel: 'Desk Node 01 not in range',
    headline: 'Desk Node 01 is away.',
    guidance: 'Wake or reconnect your companion when you return to your desk.',
    ctaLabel: 'Reconnect Node 01',
    ctaSecondary: 'Device Setup',
    accentHex: '#7A827D',
    blinkIntervalMs: 0,
    activeTicks: 0,
  },
};

export const INSIGHTS_DATASETS: Record<TimeRangeId, InsightsDataset> = {
  today: {
    id: 'today',
    label: 'Today',
    avgRate: 14.2,
    baseline: 17.0,
    deltaPercent: -16,
    summaryHeadline: 'Quieter cadence during two deep focus stretches.',
    patternTitle: 'Extended gaze slows natural rhythm',
    patternBody:
      'Between 09:50 and 10:40 your simulated cadence stayed 16–24% below your 30-day average. Brief 20-second pauses tend to bring rhythm back near 17/min.',
    samples: [
      { id: 't0', label: '08:30', time: '08:30', rate: 16.2, context: 'Morning start — relaxed reading', zone: 'steady' },
      { id: 't1', label: '09:00', time: '09:00', rate: 15.8, context: 'Inbox triage · steady blinks', zone: 'steady' },
      { id: 't2', label: '09:20', time: '09:20', rate: 16.4, context: 'Peak cadence after short break', zone: 'steady' },
      { id: 't3', label: '09:40', time: '09:40', rate: 14.6, context: 'Entering deep design focus', zone: 'dip' },
      { id: 't4', label: '09:55', time: '09:55', rate: null, context: 'Tracking paused · away from desk', zone: 'paused' },
      { id: 't5', label: '10:05', time: '10:05', rate: null, context: 'Tracking paused · away from desk', zone: 'paused' },
      { id: 't6', label: '10:20', time: '10:20', rate: 11.4, context: 'Lowest stretch · sustained gaze', zone: 'dip' },
      { id: 't7', label: '10:35', time: '10:35', rate: 13.8, context: 'Recovering after stretch', zone: 'dip' },
      { id: 't8', label: '10:50', time: '10:50', rate: 15.2, context: 'Post-break bounce near target', zone: 'steady' },
      { id: 't9', label: '11:00', time: '11:00', rate: 13.0, context: 'Current simulated session window', zone: 'dip' },
    ],
    weeklyBars: [
      { day: 'M', avg: 16.4, breaks: 4 },
      { day: 'T', avg: 15.9, breaks: 4 },
      { day: 'W', avg: 17.2, breaks: 5 },
      { day: 'T', avg: 15.1, breaks: 3 },
      { day: 'F', avg: 14.2, breaks: 3 },
      { day: 'S', avg: 17.6, breaks: 4 },
      { day: 'S', avg: 16.8, breaks: 4 },
    ],
    maxOpenGaze: '12.8s',
    observedTime: '3h 18m',
    coverage: '91%',
    breaksCompleted: 3,
    breaksTarget: 5,
    nextPause: 'Next gentle cue in 14 min',
  },
  '7d': {
    id: '7d',
    label: '7 Days',
    avgRate: 15.8,
    baseline: 17.0,
    deltaPercent: -7,
    summaryHeadline: 'Mostly steady mornings, softer late afternoons.',
    patternTitle: 'Afternoon dip repeats on heavy workdays',
    patternBody:
      'Simulated weekday data shows cadence averaging 16.9/min before noon and easing toward 14.3/min after 2:00 PM when breaks are skipped.',
    samples: [
      { id: 'w0', label: 'Mon', time: 'Mon', rate: 16.4, context: '4 breaks taken · calm pace', zone: 'steady' },
      { id: 'w1', label: 'Tue', time: 'Tue', rate: 15.9, context: 'Long afternoon call block', zone: 'steady' },
      { id: 'w2', label: 'Wed', time: 'Wed', rate: 17.2, context: 'Strongest adherence · 5/5 breaks', zone: 'steady' },
      { id: 'w3', label: 'Thu', time: 'Thu', rate: 14.4, context: 'Extended editing sprint', zone: 'dip' },
      { id: 'w4', label: 'Fri', time: 'Fri', rate: null, context: 'Travel half-day · paused', zone: 'paused' },
      { id: 'w5', label: 'Sat', time: 'Sat', rate: 17.6, context: 'Light screen usage', zone: 'steady' },
      { id: 'w6', label: 'Sun', time: 'Sun', rate: 16.1, context: 'Relaxed evening reading', zone: 'steady' },
      { id: 'w7', label: 'Today', time: 'Today', rate: 14.2, context: 'Two focus stretches so far', zone: 'dip' },
    ],
    weeklyBars: [
      { day: 'M', avg: 16.4, breaks: 4 },
      { day: 'T', avg: 15.9, breaks: 4 },
      { day: 'W', avg: 17.2, breaks: 5 },
      { day: 'T', avg: 14.4, breaks: 2 },
      { day: 'F', avg: 15.3, breaks: 3 },
      { day: 'S', avg: 17.6, breaks: 4 },
      { day: 'S', avg: 16.1, breaks: 4 },
    ],
    maxOpenGaze: '11.2s',
    observedTime: '22h 40m',
    coverage: '94%',
    breaksCompleted: 4,
    breaksTarget: 5,
    nextPause: 'Avg 4.0 breaks / active day',
  },
  '30d': {
    id: '30d',
    label: '30 Days',
    avgRate: 16.6,
    baseline: 17.0,
    deltaPercent: -2,
    summaryHeadline: 'Closely tracking your personal 17/min baseline.',
    patternTitle: 'Consistent breaks lifted monthly baseline',
    patternBody:
      'Over 30 simulated days, days with at least 4 distance rests maintained +2.1 blinks/min higher evening comfort than days with fewer pauses.',
    samples: [
      { id: 'm0', label: 'Wk 1', time: 'Week 1', rate: 15.2, context: 'Initial calibration week', zone: 'dip' },
      { id: 'm1', label: 'Wk 1.5', time: 'Day 9', rate: 16.0, context: 'Nudge cadence set to Moderate', zone: 'steady' },
      { id: 'm2', label: 'Wk 2', time: 'Week 2', rate: 16.9, context: '20-20-20 streak reached 5 days', zone: 'steady' },
      { id: 'm3', label: 'Wk 2.5', time: 'Day 16', rate: 17.4, context: 'Peak comfort week', zone: 'steady' },
      { id: 'm4', label: 'Wk 3', time: 'Week 3', rate: null, context: '3 days offline (travel)', zone: 'paused' },
      { id: 'm5', label: 'Wk 3.5', time: 'Day 23', rate: 16.3, context: 'Return to desk routine', zone: 'steady' },
      { id: 'm6', label: 'Wk 4', time: 'Week 4', rate: 17.1, context: 'Baseline settled at 17.0/min', zone: 'steady' },
      { id: 'm7', label: 'Now', time: 'Current', rate: 16.6, context: '30-day rolling demonstration', zone: 'steady' },
    ],
    weeklyBars: [
      { day: 'W1', avg: 15.4, breaks: 3 },
      { day: 'W2', avg: 16.9, breaks: 4 },
      { day: 'W3', avg: 16.3, breaks: 4 },
      { day: 'W4', avg: 17.1, breaks: 5 },
      { day: 'Now', avg: 16.6, breaks: 4 },
    ],
    maxOpenGaze: '10.1s',
    observedTime: '94h 12m',
    coverage: '95%',
    breaksCompleted: 4,
    breaksTarget: 5,
    nextPause: '18 calm rhythm days this month',
  },
};

export const BLINK_MEMORIES: MemoryItem[] = [
  {
    id: 'mem-wellness',
    group: 'Today',
    title: 'Morning cadence drift',
    time: '10:15 AM',
    summary: 'Noticed a dip during deep work and queued a 20s gaze break.',
    metricTag: '14.2 /min',
    kind: 'voice',
    messages: [
      { from: 'user', time: '10:14 AM', text: 'How have my eyes been doing this morning?' },
      {
        from: 'blink',
        time: '10:15 AM',
        text: 'Your simulated cadence averaged 14.2 blinks/min compared to your 17.0 baseline, mostly dipping during two longer focus stretches. A brief 20-second horizon rest is a gentle way to reset.',
      },
    ],
  },
  {
    id: 'mem-schedule',
    group: 'Today',
    title: 'Afternoon focus quiet hours',
    time: '8:30 AM',
    summary: 'Synced Calendar blocks and softened nudges for 2:00 PM review.',
    metricTag: '2:00 PM DND',
    kind: 'schedule',
    messages: [
      { from: 'user', time: '8:29 AM', text: 'Keep nudges quiet during my 2 PM design review.' },
      {
        from: 'blink',
        time: '8:30 AM',
        text: 'Set. Quiet Hours cover 12:30–1:30 PM and your 2:00 PM review block (simulated calendar integration).',
      },
    ],
  },
  {
    id: 'mem-ergonomics',
    group: 'Earlier',
    title: 'Desk distance & warm light',
    time: 'Yesterday',
    summary: 'Checked viewing distance and room brightness balance.',
    metricTag: '62 cm',
    kind: 'sensor',
    messages: [
      { from: 'user', time: 'Yesterday', text: 'Is my monitor distance comfortable?' },
      {
        from: 'blink',
        time: 'Yesterday',
        text: 'Desk Node 01 estimates roughly 62 cm distance under soft ambient light — comfortably inside your preferred working range.',
      },
    ],
  },
  {
    id: 'mem-hardware',
    group: 'Earlier',
    title: 'Desk Node 01 pairing',
    time: 'May 14',
    summary: 'Calibrated twin eye expressions and initial blink baseline.',
    metricTag: 'v3.4.1',
    kind: 'hardware',
    messages: [
      { from: 'user', time: 'May 14', text: 'Pair Desk Node 01 and calibrate my baseline.' },
      {
        from: 'blink',
        time: 'May 14',
        text: 'Blink Desk Node 01 paired cleanly and established a personal demonstration baseline of 17.0 blinks/min.',
      },
    ],
  },
];

export const QUICK_PROMPTS = [
  'How are my eyes right now?',
  'Start a 20s horizon break',
  'Why did cadence dip at 10 AM?',
  'Check afternoon calendar blocks',
];
