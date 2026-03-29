"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import config from "@/config";

// ── Icons ──────────────────────────────────────────────────────────────────────

function ZapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// ── Error messages ─────────────────────────────────────────────────────────────

const ERROR_MESSAGES = {
  Configuration: "Problème de configuration serveur. Vérifiez RESEND_API_KEY sur Vercel.",
  AccessDenied: "Accès refusé.",
  Verification: "Le lien de connexion a expiré ou a déjà été utilisé. Demandez-en un nouveau.",
  OAuthSignin: "Erreur lors de la connexion Google. Réessayez.",
  OAuthCallback: "Erreur lors du retour Google. Réessayez.",
  EmailSignin: "Impossible d'envoyer l'email. Vérifiez votre adresse et réessayez.",
  Default: "Une erreur est survenue. Réessayez.",
};

// ── Inner component (reads search params) ─────────────────────────────────────

function SignInForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || config.auth.callbackUrl;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [formError, setFormError] = useState(null);

  const errorMessage = errorParam ? (ERROR_MESSAGES[errorParam] || ERROR_MESSAGES.Default) : null;

  async function handleEmailSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setFormError(null);

    try {
      const result = await signIn("email", {
        email: email.trim(),
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setFormError(ERROR_MESSAGES[result.error] || ERROR_MESSAGES.Default);
      } else {
        setEmailSent(true);
      }
    } catch {
      setFormError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl });
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (emailSent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "#EDE9FE" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <div>
          <h2 className="text-[18px] font-bold text-[#1A1A1A]">Vérifiez votre email</h2>
          <p className="text-[14px] text-[#4B5563] mt-1">
            Un lien de connexion a été envoyé à <strong>{email}</strong>
          </p>
        </div>
        <p className="text-[12px] text-[#9CA3AF]">
          Le lien expire dans 24h · Pas de spam, jamais
        </p>
        <button
          onClick={() => { setEmailSent(false); setEmail(""); }}
          className="text-[13px] text-[#6C63FF] hover:underline"
        >
          Utiliser une autre adresse
        </button>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* Server / URL error */}
      {errorMessage && (
        <div
          className="px-4 py-3 rounded-lg text-[13px]"
          style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}
        >
          {errorMessage}
        </div>
      )}

      {/* Email Magic Link form */}
      <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[#1A1A1A]">Adresse email</span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            className="px-3.5 py-2.5 rounded-lg text-[14px] text-[#1A1A1A] outline-none transition-shadow"
            style={{
              border: "1.5px solid #E5E3DF",
              backgroundColor: "white",
            }}
            onFocus={(e) => { e.target.style.borderColor = "#6C63FF"; e.target.style.boxShadow = "0 0 0 3px rgba(108,99,255,0.1)"; }}
            onBlur={(e) => { e.target.style.borderColor = "#E5E3DF"; e.target.style.boxShadow = "none"; }}
            disabled={loading}
          />
        </label>

        {/* Form-level error */}
        {formError && (
          <p className="text-[12px]" style={{ color: "#DC2626" }}>{formError}</p>
        )}

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full py-2.5 rounded-lg text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "#6C63FF" }}
        >
          {loading ? "Envoi en cours…" : "Recevoir mon lien de connexion"}
        </button>

        <p className="text-[12px] text-center text-[#9CA3AF]">
          Pas de mot de passe requis — nous vous envoyons un lien par email
        </p>
      </form>

      {/* Separator */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ backgroundColor: "#F0EDE8" }} />
        <span className="text-[12px] text-[#9CA3AF] font-medium">ou</span>
        <div className="flex-1 h-px" style={{ backgroundColor: "#F0EDE8" }} />
      </div>

      {/* Google */}
      <button
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg text-[14px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          border: "1.5px solid #E5E3DF",
          backgroundColor: "white",
          color: "#1A1A1A",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FAF8F5"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
      >
        <GoogleIcon />
        {googleLoading ? "Redirection…" : "Continuer avec Google"}
      </button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SignInPage() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: "#FAF8F5" }}
    >
      {/* Card */}
      <div
        className="w-full max-w-sm bg-white rounded-2xl p-8 flex flex-col gap-6"
        style={{ border: "1px solid #F0EDE8", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5">
            <ZapIcon />
            <span className="text-[15px] font-bold text-[#6C63FF]">REVENANT</span>
          </Link>
          <div className="text-center">
            <h1 className="text-[20px] font-bold text-[#1A1A1A]">Connexion</h1>
            <p className="text-[13px] text-[#4B5563] mt-1">
              Accédez à votre tableau de bord REVENANT
            </p>
          </div>
        </div>

        {/* Form */}
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg" style={{ backgroundColor: "#FAF8F5" }} />}>
          <SignInForm />
        </Suspense>
      </div>

      {/* Footer */}
      <p className="mt-6 text-[12px] text-[#9CA3AF] text-center">
        En vous connectant, vous acceptez nos{" "}
        <Link href="/tos" className="hover:underline text-[#6C63FF]">CGU</Link>
        {" "}et notre{" "}
        <Link href="/privacy-policy" className="hover:underline text-[#6C63FF]">Politique de confidentialité</Link>
      </p>
    </main>
  );
}
