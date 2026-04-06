'use client';

import { useEffect, useState } from 'react';
import type { HealthScore } from '@/types/revenant';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getScoreColor(score: number): string {
  if (score <= 40) return '#DC2626';
  if (score <= 70) return '#D97706';
  if (score <= 85) return '#16A34A';
  return '#6C63FF';
}

function getScoreLabel(score: number): { label: string; color: string } {
  if (score <= 40) return { label: '⚠ Critical', color: '#DC2626' };
  if (score <= 70) return { label: 'At Risk',    color: '#D97706' };
  if (score <= 85) return { label: 'Good',       color: '#16A34A' };
  return                   { label: 'Excellent', color: '#6C63FF' };
}

function getBarColor(value: number | boolean): string {
  if (typeof value === 'boolean') return value ? '#16A34A' : '#DC2626';
  if (value >= 70) return '#16A34A';
  if (value >= 40) return '#D97706';
  return '#DC2626';
}

interface Props {
  score: number;
  dimensions: HealthScore['dimensions'];
  computedAt?: string;
}

export default function HealthScoreGauge({ score, dimensions, computedAt }: Props) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    const duration = 900;

    function step(ts: number) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      // ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimated(Math.round(eased * score));
      if (progress < 1) requestAnimationFrame(step);
    }

    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [score]);

  const color = getScoreColor(score);
  const { label: qualityLabel, color: qualityColor } = getScoreLabel(score);
  const strokeDashoffset = CIRCUMFERENCE * (1 - animated / 100);

  let lastUpdated = '';
  if (computedAt) {
    const mins = Math.round((Date.now() - new Date(computedAt).getTime()) / 60000);
    if (mins < 2)        lastUpdated = 'Updated just now';
    else if (mins < 60)  lastUpdated = `Updated ${mins}m ago`;
    else if (mins < 1440) lastUpdated = `Updated ${Math.round(mins / 60)}h ago`;
    else                  lastUpdated = `Updated ${Math.round(mins / 1440)}d ago`;
  }

  const dimensionEntries: Array<{ label: string; value: number | boolean }> = [
    { label: 'Expiry Risk',    value: dimensions.expiryRisk },
    { label: 'Failure Rate',   value: dimensions.failureRate },
    { label: 'Recovery Rate',  value: dimensions.recoveryRate },
    { label: 'Customer Risk',  value: dimensions.customerRisk },
    { label: 'Dunning Config', value: dimensions.dunningConfig },
  ];

  return (
    <div
      className="bg-white rounded-xl p-6 flex flex-col gap-5 h-full"
      style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Revenue Health Score</h2>
        {lastUpdated && (
          <span className="text-[11px] text-[#9CA3AF]">{lastUpdated}</span>
        )}
      </div>

      {/* Gauge + dimensions */}
      <div className="flex items-center gap-6">
        {/* SVG circular gauge */}
        <div className="flex-shrink-0 flex flex-col items-center gap-2">
          <svg width="128" height="128" viewBox="0 0 128 128">
            {/* Track */}
            <circle
              cx="64" cy="64" r={RADIUS}
              fill="none"
              stroke="#F0EDE8"
              strokeWidth="10"
            />
            {/* Progress */}
            <circle
              cx="64" cy="64" r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 64 64)"
            />
            {/* Score */}
            <text
              x="64" y="57"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="34"
              fontWeight="700"
              fill={color}
              fontFamily="inherit"
            >
              {animated}
            </text>
            {/* /100 */}
            <text
              x="64" y="80"
              textAnchor="middle"
              fontSize="12"
              fill="#9CA3AF"
              fontFamily="inherit"
            >
              /100
            </text>
          </svg>
          <span className="text-[13px] font-semibold" style={{ color: qualityColor }}>
            {qualityLabel}
          </span>
        </div>

        {/* Dimension bars */}
        <div className="flex flex-col gap-3 flex-1">
          {dimensionEntries.map((dim) => {
            const numValue = typeof dim.value === 'boolean'
              ? (dim.value ? 100 : 0)
              : dim.value;
            const barColor = getBarColor(dim.value);
            const displayValue = typeof dim.value === 'boolean'
              ? (dim.value ? '✓' : '✗')
              : `${numValue}`;

            return (
              <div key={dim.label} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#4B5563]">{dim.label}</span>
                  <span
                    className="text-[11px] font-semibold w-7 text-right"
                    style={{ color: barColor }}
                  >
                    {displayValue}
                  </span>
                </div>
                <div
                  className="relative h-1.5 rounded-full w-full"
                  style={{ backgroundColor: '#F0EDE8' }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${Math.min(numValue, 100)}%`,
                      backgroundColor: barColor,
                      transition: 'width 0.8s ease-out',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
