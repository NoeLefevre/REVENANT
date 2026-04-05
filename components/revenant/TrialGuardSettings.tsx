'use client';

import { useState } from 'react';

interface TrialGuardSettingsProps {
  initialEnabled: boolean;
  initialThreshold: number;
}

export default function TrialGuardSettings({
  initialEnabled,
  initialThreshold,
}: TrialGuardSettingsProps) {
  const [enabled, setEnabled]       = useState(initialEnabled);
  const [threshold, setThreshold]   = useState(String(initialThreshold));
  const [isSaving, setIsSaving]     = useState(false);
  const [savedAt, setSavedAt]       = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const isDirty =
    enabled !== initialEnabled ||
    Number(threshold) !== initialThreshold;

  async function handleSave() {
    const parsed = parseInt(threshold, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      setError('Radar threshold must be between 0 and 100.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/settings/trial-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, radarThreshold: parsed }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Save failed');
      }

      setSavedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-4 p-4 rounded-lg"
      style={{ backgroundColor: '#F7F5F2' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#1A1A1A]">
            Trial Guard (SmartCharge)
          </p>
          <p className="text-[12px] text-[#9CA3AF]">
            Pre-authorizes high-risk trial signups to validate the card before conversion
          </p>
        </div>

        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className="relative flex-shrink-0 inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none"
          style={{ backgroundColor: enabled ? '#6C63FF' : '#D1D5DB' }}
        >
          <span
            className="inline-block w-4 h-4 rounded-full bg-white shadow transition-transform"
            style={{ transform: enabled ? 'translateX(24px)' : 'translateX(4px)' }}
          />
        </button>
      </div>

      {/* Radar threshold (only when enabled) */}
      {enabled && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">
            Radar Risk Score threshold
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-20 h-9 px-3 rounded-lg border text-[13px] text-[#1A1A1A] focus:outline-none focus:ring-2"
              style={{
                border: '1px solid #E5E7EB',
                backgroundColor: 'white',
                // @ts-ignore
                '--tw-ring-color': '#6C63FF',
              }}
            />
            <span className="text-[12px] text-[#6B7280]">
              Flag trials with Radar score ≥ {threshold || '—'}. Default: 65.
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-[12px] text-[#DC2626]">{error}</p>
      )}

      {/* Save row */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className="px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#6C63FF' }}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        {savedAt && !isDirty && (
          <span className="text-[12px] text-[#9CA3AF]">Saved at {savedAt}</span>
        )}
      </div>
    </div>
  );
}
