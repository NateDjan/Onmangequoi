import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { trackLogin } from "@/lib/analytics";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function LoginPage() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { lang } = useLanguage();

  // Determine post-login redirect
  const fromParam = searchParams.get("from");
  const periodParam = searchParams.get("period");
  const getRedirectPath = () => {
    if (fromParam === "pricing") {
      return `/pricing?autocheckout=1${periodParam ? `&period=${periodParam}` : ""}`;
    }
    return "/";
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  // OTP verification step
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError("");
    try {
      await signIn("google", { redirectTo: getRedirectPath() });
      trackLogin("google");
    } catch {
      setError(lang === "fr" ? "Erreur Google, réessaie." : "Google error, please retry.");
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const isTest = email.endsWith("@test.local");
    const provider = isTest ? "test" : "password";

    // 1. Try sign in first (account exists)
    try {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("password", password);
      fd.set("flow", "signIn");
      const result = await signIn(provider, fd);
      if (result.signingIn) {
        trackLogin("email");
        navigate(getRedirectPath(), { replace: true });
        return;
      }
      // signingIn: false means OTP verification needed even for signIn
      setAwaitingOtp(true);
      setLoading(false);
      return;
    } catch {
      // sign in failed — account may not exist, try sign up
    }

    // 2. Try sign up (create new account)
    try {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("password", password);
      fd.set("flow", "signUp");
      const result = await signIn(provider, fd);
      if (result.signingIn) {
        trackLogin("email-signup");
        navigate(getRedirectPath(), { replace: true });
        return;
      }
      // signingIn: false → OTP email sent, need to verify
      trackLogin("email-signup");
      setAwaitingOtp(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("password") || msg.includes("8")) {
        setError(
          lang === "fr"
            ? "Le mot de passe doit faire au moins 8 caractères."
            : "Password must be at least 8 characters."
        );
      } else {
        setError(
          lang === "fr"
            ? "Erreur lors de la création du compte. Vérifie ton email et mot de passe."
            : "Error creating account. Check your email and password."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOtpLoading(true);
    try {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("flow", "email-verification");
      fd.set("code", otp.trim());
      const result = await signIn("password", fd);
      if (result.signingIn) {
        navigate(getRedirectPath(), { replace: true });
        return;
      }
      setError(lang === "fr" ? "Code invalide, réessaie." : "Invalid code, please retry.");
    } catch {
      setError(lang === "fr" ? "Code invalide ou expiré." : "Invalid or expired code.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── OTP verification step ───────────────────────────────────────────
  if (awaitingOtp) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 relative">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/4 size-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 size-96 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="text-4xl mb-2">📧</div>
            <h1 className="text-2xl font-bold tracking-tight">
              {lang === "fr" ? "Vérifie ton email" : "Check your email"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {lang === "fr"
                ? `Un code de vérification a été envoyé à ${email}`
                : `A verification code was sent to ${email}`}
            </p>
          </div>

          <Card variant="elevated">
            <CardContent className="pt-6 space-y-4">
              <form onSubmit={handleOtpSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">
                    {lang === "fr" ? "Code de vérification" : "Verification code"}
                  </Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    placeholder="123456"
                    autoComplete="one-time-code"
                    className="h-11 text-center text-xl tracking-widest font-mono"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    autoFocus
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full h-11 gap-2" disabled={otpLoading || otp.length < 6}>
                  {otpLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                  {otpLoading
                    ? (lang === "fr" ? "Vérification…" : "Verifying…")
                    : (lang === "fr" ? "Valider le code" : "Verify code")}
                </Button>
              </form>

              <button
                type="button"
                onClick={() => { setAwaitingOtp(false); setOtp(""); setError(""); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition text-center"
              >
                {lang === "fr" ? "← Retour" : "← Back"}
              </button>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            {lang === "fr"
              ? "Le code est valable 15 minutes. Vérifie tes spams si tu ne le vois pas."
              : "The code is valid for 15 minutes. Check your spam if you don't see it."}
          </p>
        </div>
      </div>
    );
  }

  // ─── Main login / sign-up form ────────────────────────────────────────
  return (
    <div className="flex-1 flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 size-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl mb-2">🍽️</div>
          <h1 className="text-2xl font-bold tracking-tight">
            {lang === "fr" ? "Connexion / Inscription" : "Sign in / Sign up"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {lang === "fr"
              ? "Compte existant ? Tu te connectes. Nouveau ? On te crée un compte."
              : "Existing account? You're signed in. New? We'll create your account."}
          </p>
        </div>

        <Card variant="elevated">
          <CardContent className="pt-6 space-y-4">
            {/* Google */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 gap-2 font-medium"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
            >
              {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
              {lang === "fr" ? "Continuer avec Google" : "Continue with Google"}
            </Button>

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-surface-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">{lang === "fr" ? "ou" : "or"}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{lang === "fr" ? "Email" : "Email"}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ton@email.com"
                  autoComplete="email"
                  className="h-11"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{lang === "fr" ? "Mot de passe" : "Password"}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-11"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {lang === "fr" ? "8 caractères minimum" : "Minimum 8 characters"}
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full h-11 gap-2" disabled={loading || googleLoading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                {loading
                  ? (lang === "fr" ? "Connexion…" : "Signing in…")
                  : (lang === "fr" ? "Connexion / Créer un compte" : "Sign in / Create account")
                }
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {lang === "fr"
            ? "Si tu as déjà un compte, tu seras connecté. Sinon, un compte est créé automatiquement."
            : "If you already have an account, you'll be signed in. Otherwise, a new account is created."}
        </p>
      </div>
    </div>
  );
}
