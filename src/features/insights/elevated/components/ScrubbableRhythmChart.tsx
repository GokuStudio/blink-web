import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Pause } from 'lucide-react';
import type { InsightsDataset } from '../data/mockBlinkData';
import { blinkSound } from '../utils/soundEngine';

interface ScrubbableRhythmChartProps {
  dataset: InsightsDataset;
}

function buildSmoothSegments(
  pts: Array<{ x: number; y: number | null }>
): Array<Array<{ x: number; y: number }>> {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const pt of pts) {
    if (pt.y === null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    } else {
      current.push({ x: pt.x, y: pt.y });
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function catmullRomPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export const ScrubbableRhythmChart: React.FC<ScrubbableRhythmChartProps> = ({
  dataset,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const W = 318;
  const H = 166;
  const padX = 10;
  const padTop = 22;
  const padBottom = 18;
  const minVal = 9.5;
  const maxVal = 19.5;

  const samples = dataset.samples;

  const { coords, segments, pausedSpan, baselineY } = useMemo(() => {
    const toX = (idx: number) =>
      padX + (idx / Math.max(1, samples.length - 1)) * (W - padX * 2);
    const toY = (v: number) =>
      padTop + ((maxVal - v) / (maxVal - minVal)) * (H - padTop - padBottom);

    const mapped = samples.map((s, idx) => ({
      x: toX(idx),
      y: s.rate !== null ? toY(s.rate) : null,
      sample: s,
    }));

    const pausedIndices = mapped
      .map((m, i) => (m.y === null ? i : -1))
      .filter((i) => i >= 0);

    let pauseRect: { x: number; w: number } | null = null;
    if (pausedIndices.length > 0) {
      const first = Math.max(0, pausedIndices[0] - 0.35);
      const last = Math.min(samples.length - 1, pausedIndices[pausedIndices.length - 1] + 0.35);
      const x1 = padX + (first / Math.max(1, samples.length - 1)) * (W - padX * 2);
      const x2 = padX + (last / Math.max(1, samples.length - 1)) * (W - padX * 2);
      pauseRect = { x: x1, w: Math.max(24, x2 - x1) };
    }

    return {
      coords: mapped,
      segments: buildSmoothSegments(mapped),
      pausedSpan: pauseRect,
      baselineY: toY(dataset.baseline),
    };
  }, [samples, dataset.baseline]);

  const updateIndexFromClientX = (clientX: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const idx = Math.round(rel * (samples.length - 1));
    setActiveIndex((prev) => {
      if (prev !== idx) blinkSound.playVernierTick(0.3);
      return idx;
    });
  };

  const inspected = activeIndex !== null ? coords[Math.min(activeIndex, coords.length - 1)] : null;

  return (
    <div className="w-full select-none">
      {/* Live Scrubbing Vernier Readout Bar */}
      <div className="mb-3 flex min-h-[38px] items-center justify-between gap-2 rounded-[14px] surface-well px-3 py-2">
        {inspected ? (
          <>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono-num text-[11px] font-medium text-[#A6FA4C]">
                  {inspected.sample.time}
                </span>
                <span className="truncate text-[11.5px] text-[#C8CFCB]">
                  {inspected.sample.context}
                </span>
              </div>
            </div>
            <div className="shrink-0 font-mono-num text-[12px] font-semibold">
              {inspected.sample.rate !== null ? (
                <span
                  className={
                    inspected.sample.zone === 'dip'
                      ? 'text-[#F0B45A]'
                      : 'text-[#A6FA4C]'
                  }
                >
                  {inspected.sample.rate.toFixed(1)}/m
                </span>
              ) : (
                <span className="text-[#8C938E]">Paused</span>
              )}
            </div>
          </>
        ) : (
          <div className="flex w-full items-center justify-between text-[11.5px] text-[#8C938E]">
            <span>Drag across the waveform to inspect cadence</span>
            <span className="font-mono-num text-[10.5px] text-[#6B736E]">
              REF {dataset.baseline.toFixed(0)}/m
            </span>
          </div>
        )}
      </div>

      {/* Interactive SVG Waveform Instrument */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={`Scrub ${dataset.label} blink rhythm`}
        aria-valuemin={0}
        aria-valuemax={samples.length - 1}
        aria-valuenow={activeIndex ?? samples.length - 1}
        aria-valuetext={
          inspected
            ? `${inspected.sample.time}: ${
                inspected.sample.rate !== null
                  ? `${inspected.sample.rate} blinks per minute`
                  : 'Tracking paused'
              }`
            : `Average ${dataset.avgRate} blinks per minute`
        }
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setActiveIndex((prev) =>
              prev === null ? 0 : Math.min(samples.length - 1, prev + 1)
            );
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setActiveIndex((prev) =>
              prev === null ? samples.length - 1 : Math.max(0, prev - 1)
            );
          } else if (e.key === 'Escape') {
            setActiveIndex(null);
          }
        }}
        className="relative rounded-[18px] surface-well p-3 focus-visible:outline-2 focus-visible:outline-[#A6FA4C]"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[166px] w-full touch-none cursor-ew-resize overflow-visible"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            updateIndexFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!dragging) return;
            updateIndexFromClientX(e.clientX);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          <defs>
            <linearGradient id="elevatedWaveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A6FA4C" stopOpacity="0.26" />
              <stop offset="68%" stopColor="#A6FA4C" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#A6FA4C" stopOpacity="0" />
            </linearGradient>
            <pattern
              id="pausedHatch"
              width="6"
              height="6"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="6"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1.5"
              />
            </pattern>
          </defs>

          {/* Subtle horizontal calibration rails */}
          {[11, 14, 17].map((val) => {
            const y = padTop + ((maxVal - val) / (maxVal - minVal)) * (H - padTop - padBottom);
            const isRef = val === 17;
            return (
              <line
                key={val}
                x1={padX}
                y1={y}
                x2={W - padX}
                y2={y}
                stroke={isRef ? 'rgba(166,250,76,0.34)' : 'rgba(255,255,255,0.045)'}
                strokeWidth={isRef ? 1 : 0.8}
                strokeDasharray={isRef ? '3 4' : undefined}
              />
            );
          })}

          {/* Baseline tag */}
          <text
            x={W - padX}
            y={baselineY - 6}
            textAnchor="end"
            fill="#A6FA4C"
            fontSize="9"
            fontFamily="Geist, sans-serif"
            opacity="0.88"
          >
            BASELINE {dataset.baseline.toFixed(0)}
          </text>

          {/* Honest Tracking Paused hatched interval */}
          {pausedSpan && (
            <g>
              <rect
                x={pausedSpan.x}
                y={14}
                width={pausedSpan.w}
                height={H - 26}
                rx="8"
                fill="url(#pausedHatch)"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="0.8"
              />
              <g transform={`translate(${pausedSpan.x + pausedSpan.w / 2}, ${H * 0.5})`}>
                <rect
                  x="-26"
                  y="-9"
                  width="52"
                  height="18"
                  rx="9"
                  fill="#151817"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="0.8"
                />
                <text
                  x="0"
                  y="3"
                  textAnchor="middle"
                  fill="#98A09A"
                  fontSize="8.2"
                  fontWeight="500"
                >
                  Paused
                </text>
              </g>
            </g>
          )}

          {/* Smooth curve + gradient area per contiguous active segment */}
          {segments.map((seg, segIdx) => {
            const d = catmullRomPath(seg);
            const areaD = `${d} L ${seg[seg.length - 1].x.toFixed(1)} ${H - padBottom} L ${seg[0].x.toFixed(1)} ${H - padBottom} Z`;
            return (
              <g key={`${dataset.id}-${segIdx}`}>
                <motion.path
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.35 }}
                  d={areaD}
                  fill="url(#elevatedWaveFill)"
                />
                <motion.path
                  initial={{ pathLength: 0.2, opacity: 0.5 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  d={d}
                  fill="none"
                  stroke="#A6FA4C"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* Precision sample tick pips along bottom axis */}
          {coords.map((c, idx) => {
            const isSelected = activeIndex === idx;
            return (
              <line
                key={c.sample.id}
                x1={c.x}
                y1={H - 10}
                x2={c.x}
                y2={isSelected ? H - 2 : H - 5}
                stroke={
                  isSelected
                    ? '#F2F4F1'
                    : c.y === null
                      ? 'rgba(255,255,255,0.14)'
                      : 'rgba(166,250,76,0.45)'
                }
                strokeWidth={isSelected ? 2 : 1.2}
                strokeLinecap="round"
              />
            );
          })}

          {/* Active scrubbing hairline & precision jewel dot */}
          {inspected && (
            <g>
              <line
                x1={inspected.x}
                y1={12}
                x2={inspected.x}
                y2={H - 12}
                stroke="rgba(242,244,241,0.34)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              {inspected.y !== null ? (
                <>
                  <circle
                    cx={inspected.x}
                    cy={inspected.y}
                    r="9"
                    fill={inspected.sample.zone === 'dip' ? '#F0B45A' : '#A6FA4C'}
                    opacity="0.24"
                  />
                  <circle
                    cx={inspected.x}
                    cy={inspected.y}
                    r="4.5"
                    fill="#0D0F0E"
                    stroke={inspected.sample.zone === 'dip' ? '#F0B45A' : '#A6FA4C'}
                    strokeWidth="2.3"
                  />
                </>
              ) : (
                <circle
                  cx={inspected.x}
                  cy={H * 0.5}
                  r="4"
                  fill="#0D0F0E"
                  stroke="#8C938E"
                  strokeWidth="1.8"
                />
              )}
            </g>
          )}
        </svg>

        {/* Bottom time labels */}
        <div className="mt-1.5 flex items-center justify-between px-1 font-mono-num text-[10px] text-[#737B76]">
          <span>{samples[0].label}</span>
          <span>{samples[Math.floor(samples.length / 3)].label}</span>
          <span>{samples[Math.floor((samples.length * 2) / 3)].label}</span>
          <span className="text-[#A6FA4C]">{samples[samples.length - 1].label}</span>
        </div>
      </div>

      {/* Honest tracking legend */}
      <div className="mt-2 flex items-center justify-between px-1 text-[10.5px] text-[#737B76]">
        <span className="inline-flex items-center gap-1.5">
          <Pause className="h-3 w-3" /> Hatched band = tracking paused
        </span>
        {activeIndex !== null && (
          <button
            type="button"
            onClick={() => setActiveIndex(null)}
            className="text-[#98A09A] hover:text-[#F2F4F1] cursor-pointer"
          >
            Reset cursor
          </button>
        )}
      </div>
    </div>
  );
};
