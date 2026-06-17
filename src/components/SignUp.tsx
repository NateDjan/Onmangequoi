import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { trackSignUp } from "@/lib/analytics";
import { useLanguage } from "@/contexts/LanguageContext";

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

function isTestEmail(email: string): boolean {
  return email.endsWith("@test.local");
}

type Step = "signUp" | { type: "verify"; email: string };

export function SignUp() {
  const { signIn } = useAuthActions();
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>("signUp");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError("");
    try {
      await signIn("google", { redirectTo: "/" });
      trackSignUp("google");
    } catch {
      setError(t("auth_googleError"));
      setGoogleLoading(false);
    }
  };

  if (step === "signUp") {
    return (
      <Card variant="elevated">
        <CardContent className="pt-6">
          {/* Google OAuth button */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 gap-2 font-medium mb-4"
            onClick={handleGoogleSignUp}
            disabled={googleLoading || loading}
          >
            {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
            {t("auth_googleContinue")}
          </Button>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-surface-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t("or")}</span>
            </div>
          </div>
          <form
            onSubmit={async e => {
              e.preventDefault();
              setError("");
              setLoading(true);

              const formData = new FormData(e.currentTarget);
              const email = formData.get("email") as string;
              const provider = isTestEmail(email) ? "test" : "password";

              try {
                const result = await signIn(provider, formData);
                trackSignUp("email");
                if (result.signingIn) {
                  // auto signed in (test accounts)
                  return;
                }
                setStep({ type: "verify", email });
              } catch {
                setError(t("auth_signupEmailError"));
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name">{t("auth_firstName")}</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder={t("auth_firstNamePlaceholder")}
                autoComplete="given-name"
                className="h-11"
                required
              />
            </div>
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
              <Label htmlFor="password">{t("auth_password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                minLength={6}
                autoComplete="new-password"
                className="h-11"
                required
              />
            </div>
            <input name="flow" value="signUp" type="hidden" />
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? t("auth_creating") : t("auth_createBtn")}
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
          <div className="mx-auto size-12 rounded-full bg-primary flex items-center justify-center mb-4">
            <Mail className="size-6 text-primary-foreground" />
          </div>
          <h2 className="font-semibold text-lg">{t("auth_checkEmail")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("auth_codeSentTo")} <strong>{step.email}</strong>
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
              setError(t("auth_wrongCredentials"));
            } finally {
              setLoading(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="code">{t("auth_verifyCode")}</Label>
            <Input
              id="code"
              name="code"
              type="text"
              placeholder={t("auth_verifyCodePlaceholder")}
              autoComplete="one-time-code"
              className="h-11 text-center tracking-[0.5em] font-mono"
              required
            />
          </div>
          <input name="flow" value="email-verification" type="hidden" />
          <input name="email" value={step.email} type="hidden" />
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? t("auth_verifying") : t("auth_verifyBtn")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
