import { useQuery, useAction } from "convex/react";
import { useConvexAuth } from "convex/react";
import { ArrowLeft, Check, Crown, ExternalLink, Sparkles, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "../../convex/_generated/api";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function PricingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, lang } = useLanguage();
  const { isAuthenticated } = useConvexAuth();
  const status = useQuery(api.subscriptions.getStatus);
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const createCheckoutSession = useAction(api.stripe.createCheckoutSession);
  const createPortalSession = useAction(api.stripe.createPortalSession);

  // Handle success/cancel redirects from Stripe
  useEffect(() => {
    if (searchParams.get("success") === "1") {
      toast.success(
        lang === "fr"
          ? "🎉 Abonnement Pro activé ! Profite de toutes les fonctionnalités."
          : "🎉 Pro subscription activated! Enjoy all features."
      );
    }
    if (searchParams.get("cancelled") === "1") {
      toast.info(
        lang === "fr" ? "Paiement annulé." : "Payment cancelled."
      );
    }
  }, [searchParams, lang]);

  // Auto-trigger checkout after login redirect (e.g. ?autocheckout=1&period=yearly)
  useEffect(() => {
    if (searchParams.get("autocheckout") === "1" && isAuthenticated && status && !status.isPro) {
      const savedPeriod = searchParams.get("period") as "monthly" | "yearly" | null;
      if (savedPeriod === "monthly" || savedPeriod === "yearly") {
        setPeriod(savedPeriod);
      }
      // Small delay to let Convex auth settle
      const timer = setTimeout(() => {
        void handleUpgradeAction(savedPeriod ?? period);
      }, 500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, status]);

  const handleUpgradeAction = async (billingPeriod: "monthly" | "yearly") => {
    setLoading(true);
    try {
      const { url } = await createCheckoutSession({ billingPeriod });
      window.location.href = url;
    } catch (err) {
      console.error(err);
      toast.error(
        lang === "fr"
          ? "Erreur lors de la création du paiement."
          : "Error creating payment session."
      );
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    // If not authenticated, redirect to login/signup first, then come back to auto-checkout
    if (!isAuthenticated) {
      navigate(`/login?from=pricing&period=${period}`);
      return;
    }
    await handleUpgradeAction(period);
  };

  const handleManage = async () => {
    setPortalLoading(true);
    try {
      const { url } = await createPortalSession({});
      window.location.href = url;
    } catch (err) {
      console.error(err);
      toast.error(
        lang === "fr"
          ? "Erreur lors de l'ouverture du portail."
          : "Error opening billing portal."
      );
      setPortalLoading(false);
    }
  };

  const freeFeatures = [
    lang === "fr" ? "3 suggestions par jour" : "3 suggestions per day",
    lang === "fr" ? "Recettes de base" : "Basic recipes",
    lang === "fr" ? "Publicités" : "Ads included",
  ];

  const proFeatures = [
    lang === "fr" ? "Suggestions illimitées" : "Unlimited suggestions",
    lang === "fr" ? "Sans publicité" : "Ad-free experience",
    lang === "fr" ? "Scan frigo avancé" : "Advanced fridge scan",
    lang === "fr" ? "Planning semaine" : "Weekly meal planning",
    lang === "fr" ? "Liste de courses" : "Shopping list",
    lang === "fr" ? "Support prioritaire" : "Priority support",
  ];

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-lg space-y-8">
        {/* Back */}
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </button>

        {/* Title */}
        <div className="text-center space-y-3">
          <div className="mx-auto size-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Crown className="size-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {t("pricing_title")}
          </h1>
          <p className="text-muted-foreground max-w-sm mx-auto">
            {t("pricing_subtitle")}
          </p>
        </div>

        {/* Period toggle — only show if not already pro */}
        {!status?.isPro && (
          <div className="flex justify-center">
            <div className="inline-flex rounded-xl bg-secondary p-1 gap-1">
              <button
                type="button"
                onClick={() => setPeriod("monthly")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  period === "monthly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("pricing_monthly")}
              </button>
              <button
                type="button"
                onClick={() => setPeriod("yearly")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${
                  period === "yearly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("pricing_yearly")}
                <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                  {t("pricing_yearlyDiscount")}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Plans */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Free plan */}
          <div className="rounded-2xl border border-surface-border bg-card p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-foreground">{t("pricing_free")}</h3>
              <div className="mt-2">
                <span className="text-3xl font-bold text-foreground">0€</span>
                <span className="text-muted-foreground text-sm">{t("pricing_perMonth")}</span>
              </div>
            </div>

            <ul className="space-y-2.5">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="size-4 text-muted-foreground/60 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Button
              variant="outline"
              className="w-full"
              disabled={!status?.isPro}
            >
              {status?.isPro
                ? (lang === "fr" ? "Plan actuel" : "Current plan")
                : t("pricing_currentPlan")}
            </Button>
          </div>

          {/* Pro plan */}
          <div className="rounded-2xl border-2 border-primary/50 bg-card p-6 space-y-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/20 to-transparent" />

            <div className="relative">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-foreground">{t("pricing_pro")}</h3>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="size-3" /> PRO
                </span>
              </div>
              {status?.isPro ? (
                <div className="mt-2">
                  <span className="text-3xl font-bold text-foreground">
                    {status.billingPeriod === "monthly" ? "3,99€" : "29,99€"}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {status.billingPeriod === "monthly" ? t("pricing_perMonth") : t("pricing_perYear")}
                  </span>
                  {status.currentPeriodEnd && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {lang === "fr" ? "Renouvellement le" : "Renews on"}{" "}
                      {new Date(status.currentPeriodEnd).toLocaleDateString(
                        lang === "fr" ? "fr-FR" : "en-GB",
                        { day: "numeric", month: "long", year: "numeric" }
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <span className="text-3xl font-bold text-foreground">
                    {period === "monthly" ? "3,99€" : "29,99€"}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {period === "monthly" ? t("pricing_perMonth") : t("pricing_perYear")}
                  </span>
                  {period === "yearly" && (
                    <p className="text-xs text-green-500 mt-1 font-medium">
                      = 2,50€{t("pricing_perMonth")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <ul className="space-y-2.5">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="size-4 text-primary mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {status?.isPro ? (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleManage}
                disabled={portalLoading}
              >
                <ExternalLink className="size-4" />
                {portalLoading
                  ? (lang === "fr" ? "Chargement..." : "Loading...")
                  : (lang === "fr" ? "Gérer mon abonnement" : "Manage subscription")}
              </Button>
            ) : (
              <Button
                className="w-full gap-2 shadow-lg shadow-primary/20"
                onClick={handleUpgrade}
                disabled={loading}
              >
                <Zap className="size-4" />
                {loading
                  ? (lang === "fr" ? "Redirection..." : "Redirecting...")
                  : t("pricing_upgrade")}
              </Button>
            )}
          </div>
        </div>

        {/* Usage info for logged in users */}
        {status && !status.isPro && (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {status.usage}/{status.limit} {t("usage_remaining")}
            </p>
          </div>
        )}

        {/* Notice for unauthenticated users */}
        {!isAuthenticated && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-center text-sm text-muted-foreground">
            {lang === "fr"
              ? "💡 Un compte est créé automatiquement lors du paiement si tu n'en as pas encore."
              : "💡 An account is automatically created at checkout if you don't have one yet."}
          </div>
        )}

        {/* Security badges */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>🔒 {lang === "fr" ? "Paiement sécurisé Stripe" : "Secure payment via Stripe"}</span>
          <span>·</span>
          <span>{lang === "fr" ? "Annulation possible à tout moment" : "Cancel anytime"}</span>
        </div>
      </div>
    </div>
  );
}
