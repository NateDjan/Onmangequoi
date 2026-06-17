/**
 * Plazam — "Shazam du plat"
 * Take a photo of a dish → AI identifies it and gives the full recipe
 */
import { useAction } from "convex/react";
import {
  Camera,
  ChefHat,
  Clock,
  Loader2,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Upload,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "../../convex/_generated/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Ingredient {
  quantity: string;
  name: string;
}

interface PlazamResult {
  dishName: string;
  description: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  ingredients: Ingredient[];
  steps: string[];
  tips: string;
  imagePrompt: string;
}

// ─── Image compression ────────────────────────────────────────────────────────
function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], "dish.jpg", { type: "image/jpeg" }) : file),
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PlazamPage() {
  const [phase, setPhase] = useState<"idle" | "previewing" | "analyzing" | "result" | "error">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<PlazamResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useAction(api.viktorTools.generateUploadUrl);
  const getStorageUrl = useAction(api.viktorTools.getStorageUrl);
  const analyzeDishPhoto = useAction(api.viktorTools.analyzeDishPhoto);

  // ── File selection ──────────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setPhase("previewing");
    setResult(null);
    setError(null);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Trigger file picker ─────────────────────────────────────────────────────
  const openPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── Analyze ─────────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!preview) return;
    setPhase("analyzing");
    setError(null);

    try {
      // Re-fetch the file from the preview blob
      const blob = await fetch(preview).then((r) => r.blob());
      const file = await compressImage(new File([blob], "dish.jpg", { type: blob.type || "image/jpeg" }));

      // Upload to Convex storage
      const uploadUrl = await generateUploadUrl();
      const uploadResp = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await uploadResp.json();

      // Get public URL
      const imageUrl = await getStorageUrl({ storageId });
      if (!imageUrl) throw new Error("Upload échoué");

      // Analyze
      const resp = await analyzeDishPhoto({ imageUrl });

      if (!resp.success) {
        setError(resp.error);
        setPhase("error");
        return;
      }

      setResult(resp);
      setPhase("result");
    } catch (err) {
      console.error("Plazam error:", err);
      setError("Une erreur est survenue, réessaie avec une autre photo.");
      setPhase("error");
    }
  }, [preview, generateUploadUrl, getStorageUrl, analyzeDishPhoto]);

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setPhase("idle");
    setPreview(null);
    setResult(null);
    setError(null);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <UtensilsCrossed className="size-5" />
          </Link>
          <div className="flex items-center gap-2">
            <ScanSearch className="size-5 text-primary" />
            <span className="font-bold text-lg">Plazam</span>
          </div>
          <span className="text-xs text-muted-foreground ml-auto">Shazam du plat 🍽️</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* ── IDLE: upload zone ── */}
        {phase === "idle" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">Prends en photo un plat</h1>
              <p className="text-muted-foreground">
                L'IA identifie le plat et te donne la recette complète instantanément
              </p>
            </div>

            <button
              type="button"
              onClick={openPicker}
              className="w-full border-2 border-dashed border-border hover:border-primary/60 rounded-2xl p-12 flex flex-col items-center gap-4 transition-colors group cursor-pointer bg-card hover:bg-primary/5"
            >
              <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Camera className="size-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Importer une photo</p>
                <p className="text-sm text-muted-foreground mt-1">galerie, caméra ou fichier</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Camera className="size-3" />
                  <span>Appareil photo</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Upload className="size-3" />
                  <span>Galerie</span>
                </div>
              </div>
            </button>

            {/* Examples */}
            <div className="text-center text-xs text-muted-foreground">
              <p>Fonctionne avec les plats du restaurant, tes créations maison, les plats du monde…</p>
            </div>
          </div>
        )}

        {/* ── PREVIEWING: show photo + confirm ── */}
        {phase === "previewing" && preview && (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden border border-border shadow-sm">
              <img
                src={preview}
                alt="Plat à analyser"
                className="w-full max-h-96 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-3 left-3 text-white text-sm font-medium flex items-center gap-1.5">
                <Sparkles className="size-4" />
                Prêt à analyser
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                <RefreshCw className="size-4 mr-2" />
                Changer
              </Button>
              <Button onClick={handleAnalyze} className="flex-[2]">
                <ScanSearch className="size-4 mr-2" />
                Identifier ce plat
              </Button>
            </div>
          </div>
        )}

        {/* ── ANALYZING: spinner ── */}
        {phase === "analyzing" && (
          <div className="space-y-6">
            {preview && (
              <div className="relative rounded-2xl overflow-hidden border border-border opacity-60">
                <img src={preview} alt="Analyse en cours…" className="w-full max-h-96 object-cover" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="bg-background/90 backdrop-blur rounded-2xl px-6 py-4 flex flex-col items-center gap-3">
                    <Loader2 className="size-8 text-primary animate-spin" />
                    <p className="font-semibold text-sm">Analyse en cours…</p>
                    <p className="text-xs text-muted-foreground text-center">
                      L'IA identifie le plat et prépare la recette
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ERROR ── */}
        {phase === "error" && (
          <div className="space-y-4">
            {preview && (
              <div className="relative rounded-2xl overflow-hidden border border-border opacity-50">
                <img src={preview} alt="Erreur" className="w-full max-h-56 object-cover" />
              </div>
            )}
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-center">
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
            <Button onClick={handleReset} variant="outline" className="w-full">
              <RefreshCw className="size-4 mr-2" />
              Réessayer avec une autre photo
            </Button>
          </div>
        )}

        {/* ── RESULT ── */}
        {phase === "result" && result && (
          <div className="space-y-6">
            {/* Dish photo + title */}
            {preview && (
              <div className="relative rounded-2xl overflow-hidden border border-border shadow-sm">
                <img src={preview} alt={result.dishName} className="w-full max-h-72 object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h1 className="text-2xl font-bold text-white">{result.dishName}</h1>
                  {result.description && (
                    <p className="text-white/80 text-sm mt-1">{result.description}</p>
                  )}
                </div>
                {/* Plazam badge */}
                <div className="absolute top-3 right-3 bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <ScanSearch className="size-3" />
                  Plazam ✓
                </div>
              </div>
            )}

            {/* Meta info */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-xl p-3 text-center">
                <Clock className="size-4 text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Préparation</p>
                <p className="font-semibold text-sm">{result.prepTime} min</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 text-center">
                <ChefHat className="size-4 text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Cuisson</p>
                <p className="font-semibold text-sm">{result.cookTime} min</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 text-center">
                <Users className="size-4 text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Portions</p>
                <p className="font-semibold text-sm">{result.servings} pers.</p>
              </div>
            </div>

            {/* Ingredients */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/40">
                <h2 className="font-semibold text-sm">Ingrédients</h2>
              </div>
              <div className="p-4 space-y-2">
                {result.ingredients.map((ing, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-primary min-w-[60px] shrink-0">
                      {ing.quantity}
                    </span>
                    <span className="text-sm text-foreground">{ing.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Steps */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/40">
                <h2 className="font-semibold text-sm">Préparation</h2>
              </div>
              <div className="p-4 space-y-4">
                {result.steps.map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            {result.tips && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3">
                <ChefHat className="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-primary mb-1">Conseil du chef</p>
                  <p className="text-sm text-foreground">{result.tips}</p>
                </div>
              </div>
            )}

            {/* Try another */}
            <Button onClick={handleReset} variant="outline" className="w-full">
              <Camera className="size-4 mr-2" />
              Analyser un autre plat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
