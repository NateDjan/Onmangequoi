import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { ChevronRight, Loader2, Monitor, Moon, Palette, Sun, User } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "../../convex/_generated/api";

export function SettingsPage() {
  const user = useQuery(api.auth.currentUser);
  const { mode, setMode, switchable } = useTheme();
  const { t, lang } = useLanguage();
  const { signIn, signOut } = useAuthActions();
  const deleteAccount = useMutation(api.users.deleteAccount);
  const navigate = useNavigate();

  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordStep, setPasswordStep] = useState<"request" | "verify">("request");

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("email", user?.email || "");
    formData.append("flow", "reset");

    try {
      await signIn("password", formData);
      setPasswordStep("verify");
    } catch {
      setError(lang === "fr" ? "Impossible d'envoyer le code. Réessaie." : "Could not send reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.append("email", user?.email || "");
    formData.append("flow", "reset-verification");

    try {
      await signIn("password", formData);
      setSuccess(lang === "fr" ? "Mot de passe modifié !" : "Password changed successfully!");
      setTimeout(() => {
        setChangePasswordOpen(false);
        setPasswordStep("request");
        setSuccess("");
      }, 1500);
    } catch {
      setError(lang === "fr" ? "Code ou mot de passe invalide. Réessaie." : "Invalid code or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setLoading(true);
    setError("");

    try {
      await deleteAccount();
      await signOut();
      navigate("/");
    } catch {
      setError(lang === "fr" ? "Impossible de supprimer le compte. Réessaie." : "Could not delete account. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {t("settings")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {lang === "fr" ? "Gère ton compte et tes préférences" : "Manage your account and preferences"}
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
        <CardContent className="-mt-10 pb-6">
          <div className="flex items-end gap-4">
            <Avatar className="size-16 border-4 border-background shadow-lg">
              <AvatarFallback className="text-xl bg-primary text-primary-foreground">
                {user?.name?.charAt(0).toUpperCase() || (
                  <User className="size-6" />
                )}
              </AvatarFallback>
            </Avatar>
            <div className="pb-1">
              <p className="font-semibold">{user?.name || (lang === "fr" ? "Utilisateur" : "User")}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="size-4 text-muted-foreground" />
            {t("settings_appearance")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {switchable ? (
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "system" as const, icon: Monitor, label: lang === "fr" ? "Système" : "System" },
                { id: "light" as const, icon: Sun, label: lang === "fr" ? "Clair" : "Light" },
                { id: "dark" as const, icon: Moon, label: lang === "fr" ? "Sombre" : "Dark" },
              ]).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                    mode === id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="size-5" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground px-4 py-2">
              {lang === "fr" ? "Le thème suit les préférences de ton système" : "Theme follows your system preference"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4 text-muted-foreground" />
            {t("account")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <button
            onClick={() => setChangePasswordOpen(true)}
            className="w-full flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50 text-left"
          >
            <div>
              <p className="font-medium text-sm">{t("settings_changePassword")}</p>
              <p className="text-sm text-muted-foreground">
                {lang === "fr" ? "Modifier ton mot de passe" : "Update your password"}
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setDeleteAccountOpen(true)}
            className="w-full flex items-center justify-between rounded-lg border border-destructive/20 p-4 transition-colors hover:bg-destructive/5 text-left"
          >
            <div>
              <p className="font-medium text-sm text-destructive">
                {t("settings_deleteAccount")}
              </p>
              <p className="text-sm text-muted-foreground">
                {lang === "fr" ? "Supprimer définitivement ton compte" : "Permanently delete your account"}
              </p>
            </div>
            <ChevronRight className="size-4 text-destructive" />
          </button>
        </CardContent>
      </Card>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings_changePassword")}</DialogTitle>
            <DialogDescription>
              {passwordStep === "request"
                ? (lang === "fr" ? "Un code de vérification sera envoyé à ton email." : "We'll send a verification code to your email.")
                : (lang === "fr" ? "Entre le code reçu par email et ton nouveau mot de passe." : "Enter the code from your email and your new password.")}
            </DialogDescription>
          </DialogHeader>

          {passwordStep === "request" ? (
            <form onSubmit={handleRequestPasswordReset}>
              <div className="py-4">
                <p className="text-sm text-muted-foreground">
                  {lang === "fr" ? "Un code sera envoyé à : " : "A reset code will be sent to: "}
                  <span className="font-medium text-foreground">
                    {user?.email}
                  </span>
                </p>
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setChangePasswordOpen(false)}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {lang === "fr" ? "Envoyer le code" : "Send Code"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">{lang === "fr" ? "Code de vérification" : "Verification Code"}</Label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  placeholder={lang === "fr" ? "Entre le code reçu par email" : "Enter code from email"}
                  autoComplete="one-time-code"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">{lang === "fr" ? "Nouveau mot de passe" : "New Password"}</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  placeholder="••••••••"
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              {success && (
                <p className="text-sm text-success bg-success/10 rounded-lg px-3 py-2">
                  {success}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPasswordStep("request");
                    setError("");
                  }}
                >
                  {t("back")}
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {t("settings_changePassword")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings_deleteAccount")}</DialogTitle>
            <DialogDescription>
              {t("settings_deleteConfirm")}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteAccountOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={loading}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("settings_deleteAccount")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
