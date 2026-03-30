'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  disabled?: boolean;
}

export default function DisconnectStripeButton({ disabled }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleDisconnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe-connect/disconnect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Disconnection failed');
      setSuccess(true);
      setModalOpen(false);
      setTimeout(() => router.push('/onboarding'), 1500);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => { setError(null); setModalOpen(true); }}
        className="flex-shrink-0 px-4 py-2 rounded-lg text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#DC2626' }}
      >
        Disconnect
      </button>

      {/* Success toast */}
      {success && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm"
          style={{ backgroundColor: '#15803D' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Compte Stripe déconnecté — redirection en cours…
        </div>
      )}

      {/* Confirmation modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div
            className="bg-white rounded-xl p-6 flex flex-col gap-4 w-full"
            style={{ maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
          >
            {/* Header */}
            <div className="flex flex-col gap-1">
              <h2 className="text-[16px] font-bold text-[#1A1A1A]">Déconnecter Stripe ?</h2>
              <p className="text-[13px] text-[#4B5563]">
                Toutes les séquences de récupération actives seront stoppées immédiatement.
                Cette action ne peut pas être annulée.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                disabled={loading}
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-[#4B5563] hover:bg-[#F3F4F6] transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleDisconnect}
                className="px-4 py-2 rounded-lg text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2"
                style={{ backgroundColor: '#DC2626' }}
              >
                {loading && (
                  <svg className="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {loading ? 'Déconnexion…' : 'Déconnecter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
