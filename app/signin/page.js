"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import config from "@/config";

const ERROR_MESSAGES = {
  Configuration:
    "Erreur de configuration serveur. Vérifiez que RESEND_API_KEY est défini et que le domaine est vérifié sur Resend.",
  AccessDenied: "Accès refusé.",
  Verification: "Le lien de connexion a expiré ou est invalide. Demandez-en un nouveau.",
  Default: "Une erreur est survenue. Réessayez.",
};

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || config.auth.callbackUrl;
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const errorMessage = errorParam
    ? ERROR_MESSAGES[errorParam] || ERROR_MESSAGES.Default
    : null;

  const handleMagicLink = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    await signIn("email", { email, callbackUrl, redirect: false });
    setLoading(false);
    setSent(true);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <span className="text-3xl font-extrabold tracking-tight text-base-content">
            REVENANT
          </span>
          <p className="mt-1 text-sm text-base-content/60">
            Connectez-vous à votre compte
          </p>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body gap-4">
            {/* Error banner */}
            {errorMessage && (
              <div className="alert alert-error text-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Magic Link sent confirmation */}
            {sent ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">📬</div>
                <h2 className="font-bold text-lg mb-1">Vérifiez vos emails</h2>
                <p className="text-sm text-base-content/60">
                  Un lien de connexion a été envoyé à{" "}
                  <strong>{email}</strong>. Cliquez dessus pour vous connecter.
                </p>
                <button
                  className="btn btn-ghost btn-sm mt-4"
                  onClick={() => setSent(false)}
                >
                  Renvoyer un lien
                </button>
              </div>
            ) : (
              <>
                {/* Magic Link form */}
                <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
                  <div className="form-control">
                    <label className="label pb-1">
                      <span className="label-text font-medium">
                        Adresse email
                      </span>
                    </label>
                    <input
                      type="email"
                      placeholder="vous@exemple.com"
                      className="input input-bordered w-full"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary w-full"
                    disabled={loading || !email}
                  >
                    {loading ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      "Recevoir un lien de connexion"
                    )}
                  </button>
                </form>

                <p className="text-xs text-center text-base-content/50">
                  Pas de mot de passe requis — nous vous envoyons un lien de
                  connexion par email
                </p>

                {/* Divider */}
                <div className="divider text-xs text-base-content/40">ou</div>

                {/* Google */}
                <button
                  className="btn btn-outline w-full gap-2"
                  onClick={handleGoogle}
                  disabled={googleLoading}
                >
                  {googleLoading ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="w-5 h-5"
                    >
                      <path
                        fill="#FFC107"
                        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"
                      />
                      <path
                        fill="#FF3D00"
                        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                      />
                      <path
                        fill="#4CAF50"
                        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.5 26.8 36.3 24 36.3c-5.1 0-9.6-3.3-11.2-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
                      />
                      <path
                        fill="#1976D2"
                        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.2 5.4l6.2 5.2C37 38 44 33 44 24c0-1.3-.1-2.6-.4-3.9z"
                      />
                    </svg>
                  )}
                  Continuer avec Google
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInContent />
    </Suspense>
  );
}
