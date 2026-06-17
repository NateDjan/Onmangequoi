import { Link } from "react-router-dom";
import { SignUp } from "@/components/SignUp";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

export function SignupPage() {
  const { t, lang } = useLanguage();
  return (
    <div className="flex-1 flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 right-1/4 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 size-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl mb-2">🍽️</div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("auth_signupCta")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {lang === "fr" ? "Sauvegarde tes menus et retrouve ton historique" : "Save your menus and access your history"}
          </p>
        </div>

        <SignUp />

        <p className="text-center text-sm text-muted-foreground">
          {t("auth_hasAccount")}{" "}
          <Button variant="link" className="p-0 h-auto font-medium" asChild>
            <Link to="/login">{t("auth_loginCta")}</Link>
          </Button>
        </p>
      </div>
    </div>
  );
}
