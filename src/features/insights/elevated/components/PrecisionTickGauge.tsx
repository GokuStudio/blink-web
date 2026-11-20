import React from 'react';

interface PrecisionTickGaugeProps {
  total: number;
  activeCount: number;
  markerIndex?: number;
  accentColor?: string;
  colorScale?: 'solid' | 'yellow-orange-green';
  height?: number;
  ariaLabel?: string;
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function interpolateHex(hexA: string, hexB: string, t: number): string {
  const a = [
    parseInt(hexA.slice(1, 3), 16),
    parseInt(hexA.slice(3, 5), 16),
    parseInt(hexA.slice(5, 7), 16),
  ];
  const b = [
    parseInt(hexB.slice(1, 3), 16),
    parseInt(hexB.slice(3, 5), 16),
    parseInt(hexB.slice(5, 7), 16),
  ];
  const r = lerpChannel(a[0], b[0], t);
  const g = lerpChannel(a[1], b[1], t);
  const bl = lerpChannel(a[2], b[2], t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/**
 * Computes smooth yellow -> orange -> lime-green spectrum along 0..1.
 */
function getWarmToGreenColor(fraction: number): string {
  const f = Math.min(1, Math.max(0, fraction));
  if (f <= 0.45) {
    return interpolateHex('#F7D84E', '#F58A38', f / 0.45);
  }
  return interpolateHex('#F58A38', '#A6FA4C', (f - 0.45) / 0.55);
}

/**
 * Tactile vertical capsule tick gauge inspired by precision dark hardware instruments.
 */
export const PrecisionTickGauge: React.FC<PrecisionTickGaugeProps> = ({
  total,
  activeCount,
  markerIndex,
  accentColor = '#A6FA4C',
  colorScale = 'solid',
  height = 22,
  ariaLabel,
}) => {
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={activeCount}
      className="flex w-full items-center justify-between gap-[4px]"
      style={{ height: `${height}px` }}
    >
      {Array.from({ length: total }).map((_, idx) => {
        const isLit = idx < activeCount;
        const isMarker = markerIndex !== undefined && idx === markerIndex;
        const fraction = total > 1 ? idx / (total - 1) : 1;
        const tickColor =
          colorScale === 'yellow-orange-green'
            ? getWarmToGreenColor(fraction)
            : accentColor;

        const edgeFade =
          idx === 0 || idx === total - 1
            ? 0.55
            : idx === 1 || idx === total - 2
              ? 0.78
              : 1;

        return (
          <div
            key={idx}
            className="relative flex-1 rounded-full transition-all duration-300"
            style={{
              height: isMarker ? `${height}px` : `${Math.round(height * 0.78)}px`,
              backgroundColor: isMarker
                ? '#F2F4F1'
                : isLit
                  ? tickColor
                  : '#272B29',
              opacity: isLit || isMarker ? edgeFade : edgeFade * 0.75,
              boxShadow:
                isLit && !isMarker
                  ? `0 0 10px ${tickColor}55`
                  : isMarker
                    ? '0 0 8px rgba(242,244,241,0.45)'
                    : 'none',
            }}
          />
        );
      })}
    </div>
  );
};
