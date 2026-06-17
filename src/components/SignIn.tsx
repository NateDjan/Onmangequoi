import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { trackLogin } from "@/lib/analytics";
import { useLanguage } from "@/contexts/LanguageContext";

function isTestEmail(email: string): boolean {
  return email.endsWith("@test.local");
}

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

function OAuthDivider({ label }: { label: string }) {
  return (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-surface-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-2 text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

type Step =
  | "signIn"
  | { type: "forgot"; email?: string }
  | { type: "reset-code"; email: string }
  | { type: "new-password"; email: string; code: string };

export function SignIn() {
  const { signIn } = useAuthActions();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const redirectTarget = (location.state as { from?: string } | null)?.from ?? "/";
  const [step, setStep] = useState<Step>("signIn");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError("");
    try {
      await signIn("google", { redirectTo: redirectTarget });
      trackLogin("google");
    } catch {
      setError(t("auth_googleError"));
      setGoogleLoading(false);
    }
  };

  if (step === "signIn") {
    return (
      <Card variant="elevated">
        <CardContent className="pt-6">
          {/* Google OAuth button */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 gap-2 font-medium"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
          >
            {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
            {t("auth_googleContinue")}
          </Button>

          <OAuthDivider label={t("or")} />

          <form
            onSubmit={async e => {
              e.preventDefault();
              setError("");
              setLoading(true);

              const formData = new FormData(e.currentTarget);
              const email = formData.get("email") as string;
              const provider = isTestEmail(email) ? "test" : "password";
              try {
                await signIn(provider, formData);
                trackLogin("email");
                navigate(redirectTarget, { replace: true });
              } catch {
                setError(t("auth_wrongCredentials"));
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth_email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="ton@email.com"
                autoComplete="email"
                className="h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth_password")}</Label>
                <Button
                  type="button"
                  variant="link"
                  className="px-0 h-auto text-xs text-muted-foreground hover:text-primary"
                  onClick={() => setStep({ type: "forgot" })}
                >
                  {t("auth_forgotPassword")}
                </Button>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                className="h-11"
                required
              />
            </div>
            <input name="flow" value="signIn" type="hidden" />
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full h-11" disabled={loading || googleLoading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? t("auth_signingIn") : t("auth_signInBtn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (step.type === "forgot") {
    return (
      <Card variant="elevated">
        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <h2 className="font-semibold text-lg">{t("auth_resetPassword")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("auth_resetEmailHint")}
            </p>
          </div>
          <form
            onSubmit={async e => {
              e.preventDefault();
              setError("");
              setLoading(true);

              const formData = new FormData(e.currentTarget);
              const email = formData.get("email") as string;
              try {
                await signIn("password", formData);
                setStep({ type: "reset-code", email });
              } catch {
                setError(t("auth_sendCodeError"));
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth_email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="ton@email.com"
                defaultValue={step.email}
                autoComplete="email"
                className="h-11"
                required
              />
            </div>
            <input name="flow" value="reset" type="hidden" />
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? t("auth_sending") : t("auth_sendCode")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setStep("signIn")}
            >
              <ArrowLeft className="size-4" />
              {t("auth_back")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (step.type === "reset-code") {
    return (
      <Card variant="elevated">
        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <div className="mx-auto size-12 rounded-full bg-primary flex items-center justify-center mb-4">
              <Mail className="size-6 text-primary-foreground" />
            </div>
            <h2 className="font-semibold text-lg">{t("auth_checkEmail")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("auth_codeSentTo")} {step.email}
            </p>
          </div>
          <form
            onSubmit={e => {
              e.preventDefault();
              setError("");
              const formData = new FormData(e.currentTarget);
              const code = formData.get("code") as string;
              setStep({ type: "new-password", email: step.email, code });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="code">{t("auth_resetCode")}</Label>
              <Input
                id="code"
                name="code"
                type="text"
                placeholder={t("auth_resetCodePlaceholder")}
                autoComplete="one-time-code"
                className="h-11 text-center tracking-[0.5em] font-mono"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full h-11">
              {t("auth_continue")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setStep({ type: "forgot", email: step.email })}
            >
              {t("auth_resendCode")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <CardContent className="pt-6">
        <div className="text-center mb-6">
          <h2 className="font-semibold text-lg">{t("auth_newPassword")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("auth_newPasswordHint")}
          </p>
        </div>
        <form
          onSubmit={async e => {
            e.preventDefault();
            setError("");
            setLoading(true);

            const formData = new FormData(e.currentTarget);
            try {
              await signIn("password", formData);
            } catch {
              setError(t("auth_resetError"));
              setStep({ type: "forgot", email: step.email });
            } finally {
              setLoading(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("auth_newPassword")}</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              placeholder="••••••••"
              minLength={6}
              autoComplete="new-password"
              className="h-11"
              required
            />
          </div>
          <input name="flow" value="reset-verification" type="hidden" />
          <input name="email" value={step.email} type="hidden" />
          <input name="code" value={step.code} type="hidden" />
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? t("auth_resetting") : t("auth_resetBtn")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => setStep("signIn")}
          >
            <ArrowLeft className="size-4" />
            {t("auth_cancel")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
