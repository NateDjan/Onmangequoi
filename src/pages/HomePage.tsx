import { useAction, useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ArrowLeft,
  Camera,
  Check,
  ChefHat,
  Mic,
  MicOff,
  Plus,
  ScanSearch,
  Sparkles,
  Users,
  UtensilsCrossed,
  WheatOff,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useLanguage } from "@/contexts/LanguageContext";
// pdfToImage is lazy-loaded on demand (only when user uploads a PDF file)
import { useTranslatedConfig } from "@/hooks/useTranslatedConfig";
import { api } from "../../convex/_generated/api";
import { trackGenerateLead, trackSearch } from "@/lib/analytics";

// ─── Types (shared with lazy sections chunk) ──────────────────────────────────
import type {
  RecipeTypeKey,
  DietaryConstraintKey,
  Menu,
  DetectedItem,
  PhotoEntry,
  PlanMode,
  Phase,
} from "./HomePageTypes";
import { ALL_DIETARY_CONSTRAINTS } from "./HomePageTypes";

// ─── Lazy-loaded sections (not needed on first paint) ────────────────────────

const LazyPlanSection       = lazy(() => import("./HomePageSections").then(m => ({ default: m.PlanSection })));
const LazyConfirmSection    = lazy(() => import("./HomePageSections").then(m => ({ default: m.ConfirmSection })));
const LazyLoadingSection    = lazy(() => import("./HomePageSections").then(m => ({ default: m.LoadingSection })));
const LazyResultsSection    = lazy(() => import("./HomePageSections").then(m => ({ default: m.ResultsSection })));

function SectionFallback() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ opacity: 0.4, fontSize: "1.5rem" }}>⏳</span>
    </div>
  );
}

// ─── Loading Messages ─────────────────────────────────

// Loading/analyzing messages are provided by useTranslatedConfig (LOADING_MESSAGES_T, ANALYZING_MESSAGES_T)

// ─── Anonymous Usage Helpers ─────────────────────────
// Allow up to 3 anonymous generations per day (matching free plan)
const ANON_KEY = "omq_anon_usage_v1";
const ANON_DAILY_LIMIT = 1;

function getAnonymousUsageToday(): number {
  try {
    const raw = localStorage.getItem(ANON_KEY);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (date !== today) return 0;
    return count as number;
  } catch {
    return 0;
  }
}

function incrementAnonymousUsage(): number {
  const today = new Date().toISOString().slice(0, 10);
  const current = getAnonymousUsageToday();
  const next = current + 1;
  localStorage.setItem(ANON_KEY, JSON.stringify({ date: today, count: next }));
  return next;
}

// ─── Food Photo Strip ────────────────────────────────


// ─── Main Component ───────────────────────────────────

export function HomePage() {
  const { t, lang, PHASE_TITLES: PHASE_TITLES_T, LOADING_MESSAGES: LOADING_MESSAGES_T, ANALYZING_MESSAGES: ANALYZING_MESSAGES_T, PHOTO_LABELS: PHOTO_LABELS_T } = useTranslatedConfig();

  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem("onboarding_done_v1");
  });
  const [ingredients, setIngredients] = useState("");
  const [preferences, setPreferences] = useState("");
  const [planMode, setPlanMode] = useState<PlanMode>("single");
  const [servingsCount, setServingsCount] = useState<number>(() => {
    const saved = localStorage.getItem("omq_servings_v1");
    return saved ? parseInt(saved, 10) || 4 : 4;
  });
  // Recipe type preferences — loaded from Convex if authenticated, localStorage otherwise
  const [recipeTypes, setRecipeTypes] = useState<RecipeTypeKey[]>(() => {
    try {
      const saved = localStorage.getItem("omq_recipe_types_v1");
      if (saved) return JSON.parse(saved) as RecipeTypeKey[];
    } catch {}
    return ["classique"]; // default: classic only
  });
  // Dietary constraints — loaded from Convex if authenticated, localStorage otherwise
  const [dietaryConstraints, setDietaryConstraints] = useState<DietaryConstraintKey[]>(() => {
    try {
      const saved = localStorage.getItem("omq_dietary_v1");
      if (saved) return JSON.parse(saved) as DietaryConstraintKey[];
    } catch {}
    return [];
  });
  const [prefsSaved, setPrefsSaved] = useState(false); // show "préférences sauvegardées" toast
  // Multi-photo support
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null); // kept for compat (last photo)
  const [photoFile, setPhotoFile] = useState<File | null>(null); // kept for compat (last photo)
  const [phase, setPhaseRaw] = useState<Phase>("input");
  const [_phaseHistory, setPhaseHistory] = useState<Phase[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [menuImages, setMenuImages] = useState<Record<number, string>>({});
  const [imageSessionId, setImageSessionId] = useState<string | null>(null);
  const [expandedMenu, setExpandedMenu] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [analysisSummary, setAnalysisSummary] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [historySaved, setHistorySaved] = useState(false);
  const [historyId, setHistoryId] = useState<Id<"menuHistory"> | null>(null);

  // Auth
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const navigate = useNavigate();
  const saveHistory = useMutation(api.menuHistory.saveHistory);
  const updateHistoryImages = useMutation(api.menuHistory.updateHistoryImages);
  // Phase navigation with history
  const setPhase = useCallback((next: Phase) => {
    setPhaseRaw((prev) => {
      // Don't push loading/analyzing to history (transient phases)
      if (prev !== "loading" && prev !== "analyzing") {
        setPhaseHistory((h) => [...h, prev]);
      }
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    setPhaseHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setPhaseRaw(prev);
      return h.slice(0, -1);
    });
  }, []);

  const canGoBack = phase !== "input" && phase !== "loading" && phase !== "analyzing";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestMenus = useAction(api.viktorTools.suggestMenus);
  const saveUserPreferences = useMutation(api.userPreferences.savePreferences);
  const savedPreferences = useQuery(
    api.userPreferences.getPreferences,
    isAuthenticated ? {} : "skip",
  );
  const generateUploadUrl = useAction(api.viktorTools.generateUploadUrl);
  const getStorageUrl = useAction(api.viktorTools.getStorageUrl);
  const triggerPhotoAnalysis = useAction(api.viktorTools.triggerPhotoAnalysis);
  const analyzePhotoDirectly = useAction(api.viktorTools.analyzePhotoDirectly);
  const fetchAndStoreMenuImages = useAction(api.viktorTools.fetchAndStoreMenuImages);
  const createAnalysis = useMutation(api.photoAnalysis.createAnalysis);
  const [analysisId, setAnalysisId] = useState<Id<"photoAnalysis"> | null>(null);
  const analysisResult = useQuery(
    api.photoAnalysis.getAnalysis,
    analysisId ? { id: analysisId } : "skip",
  );

  // Subscribe to async image generation results (Convex reactive)
  const sessionImages = useQuery(
    api.pendingImages.getSessionImages,
    imageSessionId ? { sessionId: imageSessionId } : "skip",
  );

  const voice = useVoiceInput();


  // Handle analysis result from cron polling
  // Update menuImages as the cron delivers generated images (reactive)
  useEffect(() => {
    if (!sessionImages || sessionImages.length === 0) return;
    const updated: Record<number, string> = {};
    let hasNew = false;
    for (const img of sessionImages) {
      if (img.imageUrl && !menuImages[img.index]) {
        updated[img.index] = img.imageUrl;
        hasNew = true;
      }
    }
    if (hasNew) setMenuImages((prev) => ({ ...prev, ...updated }));
  }, [sessionImages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!analysisResult) return;
    if (analysisResult.status === "pending" || analysisResult.status === "processing") return;

    if (analysisResult.status === "done") {
      try {
        const items = JSON.parse(analysisResult.items) as Array<{
          name: string;
          confidence: string;
          category: string;
        }>;
        setDetectedItems(
          items.map((item) => ({
            ...item,
            confirmed: item.confidence === "haute",
            editing: false,
          })),
        );
        setAnalysisSummary(analysisResult.summary);
      } catch {
        setDetectedItems([]);
        setAnalysisSummary(t("analysisDone"));
      }
      setAnalysisId(null);
      setPhase("confirm");
    } else if (analysisResult.status === "error") {
      setAnalysisId(null);
      setDetectedItems([]);
      setAnalysisSummary(analysisResult.summary);
      setPhase("confirm");
    }
  }, [analysisResult]);

  // Client-side safety timeout: if analyzing takes > 35s, bail out gracefully
  useEffect(() => {
    if (phase !== "analyzing") return;
    const timer = setTimeout(() => {
      setAnalysisId(null);
      setDetectedItems([]);
      setAnalysisSummary(t("photoError"));
      setPhase("confirm");
    }, 35_000);
    return () => clearTimeout(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update history images as they arrive
  useEffect(() => {
    if (!historyId || !historySaved) return;
    const imageCount = Object.keys(menuImages).length;
    if (imageCount === 0) return;
    // Debounce: only update when all 3 images are ready (or at least some)
    const timer = setTimeout(() => {
      updateHistoryImages({
        id: historyId,
        menuImages: JSON.stringify(menuImages),
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [menuImages, historyId, historySaved, updateHistoryImages]);

  // Rotate loading messages
  useEffect(() => {
    if (phase !== "loading" && phase !== "analyzing") return;
    const messages = phase === "analyzing" ? ANALYZING_MESSAGES_T : LOADING_MESSAGES_T;
    const interval = setInterval(() => {
      setLoadingMsgIndex((i) => (i + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase]);

  // Append voice transcript to ingredients
  useEffect(() => {
    if (voice.transcript) {
      setIngredients(voice.transcript);
    }
  }, [voice.transcript]);

  // Sync recipe type preferences from Convex (authenticated users)
  useEffect(() => {
    if (savedPreferences?.recipeTypes && savedPreferences.recipeTypes.length > 0) {
      const types = savedPreferences.recipeTypes as RecipeTypeKey[];
      setRecipeTypes(types);
      localStorage.setItem("omq_recipe_types_v1", JSON.stringify(types));
    }
    if (savedPreferences?.dietaryConstraints) {
      const constraints = savedPreferences.dietaryConstraints as DietaryConstraintKey[];
      setDietaryConstraints(constraints);
      localStorage.setItem("omq_dietary_v1", JSON.stringify(constraints));
    }
  }, [savedPreferences]);

  // Handle recipe type toggle
  const handleToggleRecipeType = useCallback(async (type: RecipeTypeKey) => {
    setRecipeTypes((prev) => {
      let next: RecipeTypeKey[];
      if (prev.includes(type)) {
        // Prevent deselecting all — keep at least one
        if (prev.length === 1) return prev;
        next = prev.filter((t) => t !== type);
      } else {
        next = [...prev, type];
      }
      localStorage.setItem("omq_recipe_types_v1", JSON.stringify(next));
      return next;
    });
    setPrefsSaved(false);
  }, []);

  // Handle dietary constraint toggle
  const handleToggleDietaryConstraint = useCallback((key: DietaryConstraintKey) => {
    setDietaryConstraints((prev) => {
      const next = prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key];
      localStorage.setItem("omq_dietary_v1", JSON.stringify(next));
      return next;
    });
    setPrefsSaved(false);
  }, []);

  // Save preferences to Convex (authenticated only)
  const handleSavePreferences = useCallback(async (types: RecipeTypeKey[]) => {
    if (!isAuthenticated) return;
    try {
      await saveUserPreferences({ recipeTypes: types, dietaryConstraints });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2500);
    } catch {}
  }, [isAuthenticated, saveUserPreferences, dietaryConstraints]);

  // Auto-resize textarea
  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setIngredients(e.target.value);
      e.target.style.height = "auto";
      e.target.style.height = `${e.target.scrollHeight}px`;
    },
    [],
  );

  // Photo capture
  // Resize image to max 1200px and compress to JPEG for fast AI analysis
  const compressImage = useCallback(
    (file: File): Promise<File> =>
      new Promise((resolve) => {
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
            (blob) => {
              if (blob) {
                resolve(new File([blob], "photo.jpg", { type: "image/jpeg" }));
              } else {
                resolve(file);
              }
            },
            "image/jpeg",
            0.75,
          );
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
      }),
    [],
  );

  const PHOTO_LABELS = PHOTO_LABELS_T;

  const handlePhotoCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      for (const file of files) {
        let processedFile: File;
        let url: string;

        // Inline PDF check — keeps pdfjs-dist out of the main bundle
        const fileIsPdf =
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf");

        if (fileIsPdf) {
          // Lazy-load pdfjs-dist only when the user actually uploads a PDF
          const { pdfToImage } = await import("@/utils/pdfToImage");
          // Convert PDF to image for the vision API
          const result = await pdfToImage(file);
          processedFile = result.imageFile;
          url = result.previewUrl;
        } else {
          url = URL.createObjectURL(file);
          processedFile = await compressImage(file);
        }

        const nextLabel = fileIsPdf
          ? (lang === "fr" ? "Ticket" : "Receipt")
          : PHOTO_LABELS[photos.length % PHOTO_LABELS.length];
        const entry: PhotoEntry = {
          id: `${Date.now()}-${Math.random()}`,
          file: processedFile,
          previewUrl: url,
          label: nextLabel,
        };
        setPhotos((prev) => {
          const updated = [...prev, entry];
          // Keep compat refs pointing to last photo
          setPhotoPreview(url);
          setPhotoFile(processedFile);
          return updated;
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [compressImage, photos.length, lang],
  );

  const removePhoto = useCallback((id?: string) => {
    if (id) {
      setPhotos((prev) => {
        const updated = prev.filter((p) => p.id !== id);
        if (updated.length > 0) {
          setPhotoPreview(updated[updated.length - 1].previewUrl);
          setPhotoFile(updated[updated.length - 1].file);
        } else {
          setPhotoPreview(null);
          setPhotoFile(null);
        }
        return updated;
      });
    } else {
      setPhotos([]);
      setPhotoPreview(null);
      setPhotoFile(null);
    }
    setDetectedItems([]);
    setAnalysisSummary("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Analyze photo(s) with AI — upload all, analyze first, merge ingredients from all
  const handleAnalyzePhoto = useCallback(async () => {
    const filesToAnalyze = photos.length > 0 ? photos.map((p) => p.file) : photoFile ? [photoFile] : [];
    if (filesToAnalyze.length === 0) return;

    setPhase("analyzing");
    setLoadingMsgIndex(0);
    setError(null);

    try {
      // Upload & analyze only the first photo (AI analysis endpoint handles one at a time)
      // Other photos' ingredients will be merged via text after analysis
      const firstFile = filesToAnalyze[0];

      // 1. Upload photo to Convex storage
      const uploadUrl = await generateUploadUrl();
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": firstFile.type },
        body: firstFile,
      });
      const { storageId } = await uploadResponse.json();

      // 2. Get public URL
      const imageUrl = await getStorageUrl({ storageId });
      if (!imageUrl) throw new Error(t("photoUploadError"));

      // 3. Create pending analysis record in Convex
      const id = await createAnalysis({ storageId, imageUrl });
      setAnalysisId(id);

      // 4. Analyze directly via fal.ai Gemini vision — no agent startup, ~3s
      analyzePhotoDirectly({ analysisId: id, imageUrl }).catch(() => {
        // Fallback to cron agent if direct call fails
        triggerPhotoAnalysis({});
      });
      // useQuery (analysisResult) will pick up the result automatically via Convex reactive query
    } catch (err) {
      console.error("Photo analysis error:", err);
      setError(t("photoError"));
      setPhase("input");
    }
  }, [photos, photoFile, generateUploadUrl, getStorageUrl, createAnalysis, triggerPhotoAnalysis, analyzePhotoDirectly]);

  // Confirm detected items and generate menus
  const handleConfirmAndGenerate = useCallback(async () => {
    // Don't act while auth is still loading
    if (isAuthLoading) return;
    // Anonymous limit check: max 3/day without account
    if (!isAuthenticated) {
      const usedToday = getAnonymousUsageToday();
      if (usedToday >= ANON_DAILY_LIMIT) {
        navigate("/signup");
        return;
      }
    }
    const confirmedItems = detectedItems
      .filter((i) => i.confirmed)
      .map((i) => i.name);

    // Combine detected items with any manually typed ingredients
    const allIngredients = [
      ...confirmedItems,
      ...ingredients
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ];

    if (allIngredients.length === 0) {
      setError(t("confirmAtLeast"));
      return;
    }

    // Move to plan selection step before generating
    setPhase("plan");
    return;
  }, [detectedItems, ingredients, isAuthLoading, isAuthenticated, navigate, t, setPhase, setError]);

  // Called after plan step — actually generate menus
  const handleGenerateFromPlan = useCallback(async () => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      const usedToday = getAnonymousUsageToday();
      if (usedToday >= ANON_DAILY_LIMIT) {
        navigate("/signup");
        return;
      }
    }
    const confirmedItems = detectedItems
      .filter((i) => i.confirmed)
      .map((i) => i.name);

    const allIngredients = [
      ...confirmedItems,
      ...ingredients
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ];

    setPhase("loading");
    setLoadingMsgIndex(0);
    setError(null);
    setMenuImages({});

    try {
      // Only pass recipeTypes when no specific "envie" is provided (backend handles it)
      const result = await suggestMenus({
        ingredients: allIngredients.join(", "),
        preferences: preferences.trim() || undefined,
        planMode,
        recipeTypes: preferences.trim() ? undefined : recipeTypes,
        dietaryConstraints: dietaryConstraints.length > 0 ? dietaryConstraints : undefined,
        servings: servingsCount,
      });
      setMenus(result.menus as Menu[]);
      setHistorySaved(false);
      setHistoryId(null);
      setPhase("results");

      // Track anonymous usage
      if (!isAuthenticated) {
        incrementAnonymousUsage();
      }

      // GA4: track main conversion (photo → menu)
      trackGenerateLead({
        form_name: "recipe_generator",
        lead_type: "photo_menu",
        value: result.menus.length,
      });
      trackSearch({
        search_term: allIngredients.join(", "),
        results_count: result.menus.length,
      });

      // Auto-save if authenticated
      if (isAuthenticated) {
        try {
          const hId = await saveHistory({
            ingredients: allIngredients.join(", "),
            preferences: preferences.trim() || undefined,
            menus: JSON.stringify(result.menus),
            photoUrl: photoPreview || undefined,
          });
          setHistoryId(hId);
          setHistorySaved(true);
        } catch {
          // save failed silently
        }
      }

      // Kick off async image generation — images arrive via Convex reactive subscription
      if (result.menus.length > 0) {
        setMenuImages({}); // clear any old images
        fetchAndStoreMenuImages({
          imagePrompts: result.menus.map((m) => m.imagePrompt),
          dishNames: result.menus.map((m) => m.name),
        }).then((res) => {
          setImageSessionId(res.sessionId);
        }).catch(() => {/* images stay as skeleton on error */});
      }
    } catch (_err) {
      setError(t("genericError"));
      setPhase("plan");
    }
  }, [detectedItems, ingredients, preferences, planMode, recipeTypes, dietaryConstraints, servingsCount, suggestMenus, isAuthenticated, isAuthLoading, navigate, saveHistory, photoPreview, fetchAndStoreMenuImages]);

  // Submit (text-only, no photo)
  const handleSubmit = useCallback(async () => {
    // Don't act while auth is still loading from localStorage (false-negative)
    if (isAuthLoading) return;
    // Anonymous limit check: max 3/day without account
    if (!isAuthenticated) {
      const usedToday = getAnonymousUsageToday();
      if (usedToday >= ANON_DAILY_LIMIT) {
        navigate("/signup");
        return;
      }
    }

    const trimmed = ingredients.trim();

    // If there's a photo that hasn't been analyzed, analyze it first
    if (photoFile && detectedItems.length === 0) {
      await handleAnalyzePhoto();
      return;
    }

    if (!trimmed && detectedItems.length === 0) {
      textareaRef.current?.focus();
      return;
    }
    // Go to plan step before generating
    setPhase("plan");
    return;
  }, [
    ingredients,
    photoFile,
    detectedItems,
    handleAnalyzePhoto,
    isAuthenticated,
    isAuthLoading,
    navigate,
    textareaRef,
  ]);

  // Called from PlanSection — actually generate menus (text-only path)
  const handleGenerateFromPlanText = useCallback(async () => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      const usedToday = getAnonymousUsageToday();
      if (usedToday >= ANON_DAILY_LIMIT) {
        navigate("/signup");
        return;
      }
    }
    const trimmed = ingredients.trim();
    setPhase("loading");
    setLoadingMsgIndex(0);
    setError(null);
    setMenuImages({});

    try {
      const result = await suggestMenus({
        ingredients: trimmed,
        preferences: preferences.trim() || undefined,
        planMode,
        recipeTypes: preferences.trim() ? undefined : recipeTypes,
        dietaryConstraints: dietaryConstraints.length > 0 ? dietaryConstraints : undefined,
        servings: servingsCount,
      });
      setMenus(result.menus as Menu[]);
      setHistorySaved(false);
      setHistoryId(null);
      setPhase("results");

      // Track anonymous usage
      if (!isAuthenticated) {
        incrementAnonymousUsage();
      }

      // GA4: track main conversion (text → menu)
      trackGenerateLead({
        form_name: "recipe_generator",
        lead_type: planMode ? "weekly_plan" : "text_menu",
        value: result.menus.length,
      });
      trackSearch({
        search_term: trimmed,
        results_count: result.menus.length,
      });

      // Auto-save if authenticated
      if (isAuthenticated) {
        try {
          const hId = await saveHistory({
            ingredients: trimmed,
            preferences: preferences.trim() || undefined,
            menus: JSON.stringify(result.menus),
          });
          setHistoryId(hId);
          setHistorySaved(true);
        } catch {
          // save failed silently
        }
      }

      // Kick off async image generation — images arrive via Convex reactive subscription
      if (result.menus.length > 0) {
        setMenuImages({}); // clear any old images
        fetchAndStoreMenuImages({
          imagePrompts: result.menus.map((m) => m.imagePrompt),
          dishNames: result.menus.map((m) => m.name),
        }).then((res) => {
          setImageSessionId(res.sessionId);
        }).catch(() => {/* images stay as skeleton on error */});
      }
    } catch (_err) {
      setError(t("genericError"));
      setPhase("plan");
    }
  }, [
    ingredients,
    preferences,
    planMode,
    recipeTypes,
    dietaryConstraints,
    servingsCount,
    suggestMenus,
    isAuthenticated,
    isAuthLoading,
    navigate,
    saveHistory,
    fetchAndStoreMenuImages,
    t,
  ]);

  // Restart
  const handleRestart = useCallback(() => {
    setPhaseRaw("input");
    setPhaseHistory([]);
    setMenus([]);
    setMenuImages({});
    setIngredients("");
    setPreferences("");
    setPlanMode("single");
    setPhotos([]);
    setPhotoPreview(null);
    setPhotoFile(null);
    setExpandedMenu(null);
    setError(null);
    setDetectedItems([]);
    setAnalysisSummary("");
    setNewItemName("");
    setAnalysisId(null);
    setHistorySaved(false);
    setHistoryId(null);
    voice.resetTranscript();
  }, [voice]);

  // Toggle voice
  const toggleVoice = useCallback(() => {
    if (voice.isListening) {
      voice.stopListening();
    } else {
      voice.startListening();
    }
  }, [voice]);

  // Toggle item confirmed
  const toggleItem = useCallback((index: number) => {
    setDetectedItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, confirmed: !item.confirmed } : item,
      ),
    );
  }, []);

  // Edit item name
  const startEditItem = useCallback((index: number) => {
    setDetectedItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, editing: true } : item,
      ),
    );
  }, []);

  const saveEditItem = useCallback((index: number, newName: string) => {
    setDetectedItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, name: newName, editing: false, confirmed: true }
          : item,
      ),
    );
  }, []);

  // Remove item
  const removeItem = useCallback((index: number) => {
    setDetectedItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Add custom item
  const addItem = useCallback(() => {
    if (!newItemName.trim()) return;
    setDetectedItems((prev) => [
      ...prev,
      {
        name: newItemName.trim(),
        confidence: "haute",
        category: "autre",
        confirmed: true,
        editing: false,
      },
    ]);
    setNewItemName("");
  }, [newItemName]);

  const handleCloseOnboarding = () => {
    localStorage.setItem("onboarding_done_v1", "1");
    setShowOnboarding(false);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* ─── Onboarding Modal ─── */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl bg-card border border-primary/20">
            {/* Header */}
            <div className="px-6 pt-8 pb-4 text-center">
              <div className="text-5xl mb-3">🍽️</div>
              <h2 className="text-2xl font-bold text-foreground mb-1">{t("appName")}</h2>
              <p className="text-sm text-primary font-medium tracking-wide uppercase">{lang === "fr" ? "Ton frigo a la parole" : "Your fridge has the floor"}</p>
            </div>

            {/* Steps */}
            <div className="px-6 pb-6 space-y-3">
              {[
                { icon: "📸", title: t("howItWorks_step1_title"), desc: t("howItWorks_step1_desc") },
                { icon: "✅", title: t("howItWorks_step2_title"), desc: t("howItWorks_step2_desc") },
                { icon: "🤩", title: t("howItWorks_step3_title"), desc: t("howItWorks_step3_desc") },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-surface-subtle">
                  <span className="text-2xl shrink-0">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-6 pb-8">
              <button
                type="button"
                onClick={handleCloseOnboarding}
                className="w-full py-4 rounded-2xl text-base font-bold tracking-wide transition-all active:scale-95 bg-primary text-primary-foreground"
              >
                {lang === "fr" ? "Bon appétit 🍴" : "Bon appétit 🍴"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation bar */}
      {canGoBack && (
        <nav className="sticky top-14 z-40 bg-background/80 backdrop-blur-md border-b border-border/30" data-noads="true">
          <div className="flex items-center h-11 px-4 max-w-md mx-auto">
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition -ml-1 py-1 pr-2"
            >
              <ArrowLeft className="size-4" />
              {t("back")}
            </button>
            <span className="flex-1 text-center text-sm font-semibold text-muted-foreground truncate px-2">
              {PHASE_TITLES_T[phase]}
            </span>
            <div className="w-16" /> {/* Spacer to balance back button */}
          </div>
        </nav>
      )}

      {phase === "input" && (
        <InputSection
          ingredients={ingredients}
          preferences={preferences}
          photos={photos}
          planMode={planMode}
          photoPreview={photoPreview}
          error={error}
          voiceSupported={voice.isSupported}
          isListening={voice.isListening}
          hasPhoto={photos.length > 0 || !!photoFile}
          textareaRef={textareaRef}
          fileInputRef={fileInputRef}
          recipeTypes={recipeTypes}
          dietaryConstraints={dietaryConstraints}
          servingsCount={servingsCount}
          prefsSaved={prefsSaved}
          isAuthenticated={isAuthenticated}
          isAuthLoading={isAuthLoading}
          onIngredientsChange={handleTextareaChange}
          onPreferencesChange={setPreferences}
          onPhotoCapture={handlePhotoCapture}
          onRemovePhoto={removePhoto}
          onToggleVoice={toggleVoice}
          onAnalyzePhoto={handleAnalyzePhoto}
          onSubmit={handleSubmit}
          onToggleRecipeType={handleToggleRecipeType}
          onToggleDietaryConstraint={handleToggleDietaryConstraint}
          onServingsChange={(n: number) => { setServingsCount(n); localStorage.setItem("omq_servings_v1", String(n)); }}
          onSavePreferences={() => handleSavePreferences(recipeTypes)}
        />
      )}

      {phase === "analyzing" && (
        <Suspense fallback={<SectionFallback />}><LazyLoadingSection
          message={ANALYZING_MESSAGES_T[loadingMsgIndex % ANALYZING_MESSAGES_T.length]}
          subtitle={t("aiAnalysisSub")}
          emojis={["📸", "🔍", "🧠"]}
        /></Suspense>
      )}

      {phase === "confirm" && (
        <Suspense fallback={<SectionFallback />}><LazyConfirmSection
          photoPreview={photoPreview}
          summary={analysisSummary}
          items={detectedItems}
          preferences={preferences}
          newItemName={newItemName}
          error={error}
          onPreferencesChange={setPreferences}
          onToggleItem={toggleItem}
          onEditItem={startEditItem}
          onSaveEdit={saveEditItem}
          onRemoveItem={removeItem}
          onNewItemNameChange={setNewItemName}
          onAddItem={addItem}
          onConfirm={handleConfirmAndGenerate}
          onRestart={handleRestart}
        /></Suspense>
      )}

      {phase === "plan" && (
        <Suspense fallback={<SectionFallback />}><LazyPlanSection
          planMode={planMode}
          preferences={preferences}
          dietaryConstraints={dietaryConstraints}
          onPlanModeChange={setPlanMode}
          onPreferencesChange={setPreferences}
          onGenerate={phase === "plan" && detectedItems.length > 0
            ? handleGenerateFromPlan
            : handleGenerateFromPlanText
          }
        /></Suspense>
      )}

      {phase === "loading" && (
        <Suspense fallback={<SectionFallback />}><LazyLoadingSection
          message={LOADING_MESSAGES_T[loadingMsgIndex % LOADING_MESSAGES_T.length]}
          subtitle={lang === "fr" ? "Ça arrive, promis !" : "Coming right up!"}
          emojis={["🥘", "🍳", "🥗"]}
        /></Suspense>
      )}

      {phase === "results" && (
        <Suspense fallback={<SectionFallback />}><LazyResultsSection
          menus={menus}
          menuImages={menuImages}
          expandedMenu={expandedMenu}
          isAuthenticated={isAuthenticated}
          historySaved={historySaved}
          planMode={planMode}
          onToggleExpand={setExpandedMenu}
          onRestart={handleRestart}
          onNavigateSignup={() => navigate("/signup")}
          onNavigateHistory={() => navigate("/history")}
          onImageLoaded={(_index) => {
            // No-op: all images load in parallel with model=turbo
          }}
        /></Suspense>
      )}
    </div>
  );
}

// ─── Input Section ────────────────────────────────────

function InputSection({
  ingredients,
  preferences,
  photos,
  planMode,
  photoPreview: _photoPreview,
  error,
  voiceSupported,
  isListening,
  hasPhoto,
  textareaRef,
  fileInputRef,
  recipeTypes,
  dietaryConstraints,
  servingsCount,
  prefsSaved,
  isAuthenticated,
  isAuthLoading,
  onIngredientsChange,
  onPreferencesChange,
  onPhotoCapture,
  onRemovePhoto,
  onToggleVoice,
  onAnalyzePhoto,
  onSubmit,
  onToggleRecipeType,
  onToggleDietaryConstraint,
  onServingsChange,
  onSavePreferences,
}: {
  ingredients: string;
  preferences: string;
  photos: PhotoEntry[];
  planMode: PlanMode;
  photoPreview: string | null;
  error: string | null;
  voiceSupported: boolean;
  isListening: boolean;
  hasPhoto: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  recipeTypes: RecipeTypeKey[];
  dietaryConstraints: DietaryConstraintKey[];
  servingsCount: number;
  prefsSaved: boolean;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  onIngredientsChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onPreferencesChange: (v: string) => void;
  onPhotoCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (id?: string) => void;
  onToggleVoice: () => void;
  onAnalyzePhoto: () => void;
  onSubmit: () => void;
  onToggleRecipeType: (type: RecipeTypeKey) => void;
  onToggleDietaryConstraint: (key: DietaryConstraintKey) => void;
  onServingsChange: (n: number) => void;
  onSavePreferences: () => void;
}) {
  const [dietaryOpen, setDietaryOpen] = useState(false);
  const [servingsOpen, setServingsOpen] = useState(false);
  const { t, lang } = useLanguage();
  const { RECIPE_TYPE_CONFIG: RECIPE_TYPE_CONFIG_T } = useTranslatedConfig();

  // Dynamic daily hero image — refreshed every morning by cron
  const heroImage = useQuery(api.heroImage.getCurrent);
  // Self-hosted WebP (800px, <80 KB) — used as default until Convex resolves
  const FALLBACK_HERO = "/hero-default.webp";

  // Today in Paris ("YYYY-MM-DD") — same keying the cron uses for the hero row.
  const parisToday = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

  // Seed synchronously from the last hero we cached *for today*, so a returning
  // visitor sees today's photo immediately — no flash of the default and never a
  // previous day's image (a stale-dated cache is ignored, falling back to default).
  const [cachedHero, setCachedHero] = useState<{ imageUrl: string; dishName?: string } | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("omq_hero_v1") || "null");
      return saved?.imageUrl && saved.date === parisToday()
        ? { imageUrl: saved.imageUrl, dishName: saved.dishName }
        : null;
    } catch {
      return null;
    }
  });

  // Persist the daily hero (with its own date) once Convex resolves it.
  useEffect(() => {
    if (!heroImage?.imageUrl) return;
    setCachedHero({ imageUrl: heroImage.imageUrl, dishName: heroImage.dishName });
    try {
      localStorage.setItem(
        "omq_hero_v1",
        JSON.stringify({ date: heroImage.date, imageUrl: heroImage.imageUrl, dishName: heroImage.dishName }),
      );
    } catch {
      /* ignore quota / private-mode write errors */
    }
  }, [heroImage?.imageUrl, heroImage?.dishName, heroImage?.date]);

  // Live query wins; while it loads, use today's cached image instead of the default.
  const resolved = heroImage?.imageUrl ? heroImage : cachedHero;
  const heroSrc = resolved?.imageUrl ?? FALLBACK_HERO;
  const heroDishName = resolved?.dishName;
  // Flag: is the hero still the local default (= preloaded by <link rel=preload>)?
  const isDefaultHero = !resolved?.imageUrl;

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-8 md:py-12 animate-fade-in-up">
      <div className="w-full max-w-md space-y-5">
        {/* Hero — food photo with gradient overlay */}
        <div className="relative rounded-3xl overflow-hidden mb-1" style={{height: '220px'}}>
          {isDefaultHero ? (
            /* Default hero — self-hosted WebP, already preloaded by <link rel=preload> */
            <picture>
              <source
                srcSet="/hero-default-400.webp 400w, /hero-default.webp 800w"
                sizes="(max-width: 480px) 400px, 800px"
                type="image/webp"
              />
              <img
                src="/hero-default.webp"
                alt="Plat du jour"
                width={800}
                height={600}
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-cover"
                style={{objectPosition: 'center 40%'}}
              />
            </picture>
          ) : (
            /* Daily hero from Convex — load with high priority too */
            <img
              src={heroSrc}
              alt={heroDishName ?? "Plat du jour"}
              fetchPriority="high"
              decoding="async"
              className="w-full h-full object-cover"
              style={{objectPosition: 'center 40%'}}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/80" />
          {/* Daily dish name badge — top right */}
          {heroDishName && (
            <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1">
              <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wide">Plat du jour</span>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 p-5 text-center">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gold drop-shadow-lg">
              {t("appName")}
            </h1>
            {heroDishName ? (
              <p className="text-white/90 text-sm mt-1 drop-shadow font-medium italic">✨ {heroDishName}</p>
            ) : (
              <p className="text-white/80 text-sm mt-1 drop-shadow">
                {lang === "fr" ? "Photo du frigo, ticket de caisse ou dis-moi tes ingrédients" : "Fridge photo, grocery receipt, or tell me your ingredients"}
              </p>
            )}
          </div>
        </div>

        {/* ── Multi-photo grid ── */}
        {photos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              📸 {photos.length} photo{photos.length > 1 ? "s" : ""} {lang === "fr" ? `ajoutée${photos.length > 1 ? "s" : ""}` : "added"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <div key={photo.id} className="relative rounded-xl overflow-hidden border border-surface-border-strong aspect-square">
                  <img src={photo.previewUrl} alt={photo.label} className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5 text-center">
                    <span className="text-[10px] font-semibold text-white">{photo.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemovePhoto(photo.id)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 transition"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {photos.length < 4 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-dashed border-surface-border-strong aspect-square flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition"
                >
                  <Plus className="size-5" />
                  <span className="text-[10px] font-medium">{lang === "fr" ? "Ajouter" : "Add"}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Analyze photo button */}
        {hasPhoto && (
          <Button
            type="button"
            onClick={onAnalyzePhoto}
            size="lg"
            className="w-full h-14 text-lg font-bold rounded-xl gap-2 shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all"
          >
            <ScanSearch className="size-5" />
            {lang === "fr" ? `Analyser mes photos (${photos.length > 0 ? photos.length : 1})` : `Analyze my photos (${photos.length > 0 ? photos.length : 1})`}
          </Button>
        )}

        {/* Divider */}
        {hasPhoto && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground font-medium">{lang === "fr" ? "ou tape tes ingrédients" : "or type your ingredients"}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        {/* Ingredients input */}
        <div className="space-y-2">
          <label
            htmlFor="ingredients"
            className="text-sm font-semibold text-foreground flex items-center gap-1.5"
          >
            <UtensilsCrossed className="size-4 text-primary" />
            {lang === "fr" ? "Qu'est-ce que tu as ?" : "What do you have?"}
          </label>
          <textarea
            ref={textareaRef}
            id="ingredients"
            value={ingredients}
            onChange={onIngredientsChange}
            placeholder={t("inputPlaceholder")}
            rows={3}
            className="w-full rounded-xl border border-surface-border bg-card px-4 py-3 text-base placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none transition"
          />

          {/* ── Compact icon toolbar ── */}
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={onPhotoCapture}
              className="hidden"
            />
            {/* Camera icon */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="size-10 rounded-xl border border-surface-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-hover transition"
              title={lang === "fr" ? "Photo / Ticket" : "Photo / Receipt"}
            >
              <Camera className="size-[18px]" />
            </button>

            {/* Mic icon */}
            {voiceSupported && (
              <button
                type="button"
                onClick={onToggleVoice}
                className={`size-10 rounded-xl border flex items-center justify-center transition ${
                  isListening
                    ? "bg-primary border-primary text-primary-foreground shadow-lg"
                    : "border-surface-border bg-card text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                }`}
                title={isListening ? t("stopDictation") : t("dictate")}
              >
                <div className="relative">
                  {isListening ? <MicOff className="size-[18px]" /> : <Mic className="size-[18px]" />}
                  {isListening && <span className="absolute -inset-1.5 rounded-full bg-primary-foreground/30 animate-pulse-ring" />}
                </div>
              </button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Servings icon + dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setServingsOpen((o) => !o); setDietaryOpen(false); }}
                className={`h-10 rounded-xl border flex items-center gap-1.5 px-2.5 transition ${
                  servingsOpen
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-surface-border bg-card text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                }`}
                title={lang === "fr" ? "Nombre de personnes" : "Servings"}
              >
                <Users className="size-[18px]" />
                <span className="text-sm font-bold min-w-[1ch] text-center">{servingsCount}</span>
              </button>
              {servingsOpen && (
                <div className="absolute top-full right-0 mt-1.5 z-20 rounded-xl border border-surface-border bg-card shadow-xl shadow-black/20 backdrop-blur-xl p-3 min-w-[180px]">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    {lang === "fr" ? "Nombre de personnes" : "Number of servings"}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onServingsChange(Math.max(1, servingsCount - 1))}
                      disabled={servingsCount <= 1}
                      className="size-9 rounded-lg border border-surface-border bg-card flex items-center justify-center text-foreground hover:bg-surface-hover transition disabled:opacity-30"
                    >
                      <span className="text-lg font-bold">−</span>
                    </button>
                    <div className="flex-1 text-center">
                      <span className="text-xl font-bold text-foreground">{servingsCount}</span>
                      <p className="text-[10px] text-muted-foreground">{lang === "fr" ? (servingsCount > 1 ? "pers." : "pers.") : (servingsCount > 1 ? "people" : "person")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onServingsChange(Math.min(20, servingsCount + 1))}
                      disabled={servingsCount >= 20}
                      className="size-9 rounded-lg border border-surface-border bg-card flex items-center justify-center text-foreground hover:bg-surface-hover transition disabled:opacity-30"
                    >
                      <span className="text-lg font-bold">+</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Dietary restrictions icon + dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setDietaryOpen((o) => !o); setServingsOpen(false); }}
                className={`h-10 rounded-xl border flex items-center gap-1.5 px-2.5 transition ${
                  dietaryOpen
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : dietaryConstraints.length > 0
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-surface-border bg-card text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                }`}
                title={t("dietaryConstraints_title")}
              >
                <WheatOff className="size-[18px]" />
                {dietaryConstraints.length > 0 && (
                  <span className="text-xs font-bold min-w-[1ch] text-center">{dietaryConstraints.length}</span>
                )}
              </button>
              {dietaryOpen && (
                <div className="absolute top-full right-0 mt-1.5 z-20 rounded-xl border border-surface-border bg-card shadow-xl shadow-black/20 backdrop-blur-xl overflow-hidden min-w-[260px]">
                  <p className="text-xs font-semibold text-muted-foreground px-3 pt-3 pb-2">
                    {t("dietaryConstraints_title")}
                  </p>
                  <div className="max-h-[280px] overflow-y-auto">
                    {ALL_DIETARY_CONSTRAINTS.map(({ key, emoji }) => {
                      const isChecked = dietaryConstraints.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onToggleDietaryConstraint(key)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition border-b border-surface-border last:border-b-0 ${
                            isChecked ? "bg-primary/10" : "hover:bg-surface-hover"
                          }`}
                        >
                          <div className={`size-4 rounded border flex items-center justify-center shrink-0 transition ${
                            isChecked ? "bg-primary border-primary" : "border-surface-border-strong"
                          }`}>
                            {isChecked && <Check className="size-3 text-primary-foreground" />}
                          </div>
                          <span className="text-sm shrink-0">{emoji}</span>
                          <span className={`text-xs font-medium ${isChecked ? "text-foreground" : "text-muted-foreground"}`}>
                            {t(`dietary_${key}` as any)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Active restriction badges (compact) */}
          {dietaryConstraints.length > 0 && !dietaryOpen && (
            <div className="flex flex-wrap gap-1 px-0.5">
              {dietaryConstraints.map((key) => {
                const cfg = ALL_DIETARY_CONSTRAINTS.find((c) => c.key === key);
                return (
                  <span key={key} className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-medium px-1.5 py-0.5">
                    <span>{cfg?.emoji}</span>
                    {t(`dietary_${key}` as any)}
                    <button
                      type="button"
                      onClick={() => onToggleDietaryConstraint(key)}
                      className="ml-0.5 hover:text-destructive transition"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Plan Mode: removed — now in dedicated plan step after ingredients ── */}

        {/* ── Recipe Type Preferences ── */}
        {planMode === "single" && !preferences.trim() && (
          <div className="space-y-2" data-noads="true">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <ChefHat className="size-4 text-chart-2" />
                {lang === "fr" ? "Type de recettes" : "Recipe types"}
              </label>
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={onSavePreferences}
                  className="text-xs text-primary hover:underline transition"
                >
                  {prefsSaved ? (lang === "fr" ? "✅ Sauvegardé !" : "✅ Saved!") : (lang === "fr" ? "Sauvegarder mes préfs" : "Save preferences")}
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              {lang === "fr" ? `Sélectionne les types que tu veux. ${recipeTypes.length} recette${recipeTypes.length > 1 ? "s" : ""} sera générée.` : `Select the types you want. ${recipeTypes.length} recipe${recipeTypes.length > 1 ? "s" : ""} will be generated.`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(RECIPE_TYPE_CONFIG_T) as [RecipeTypeKey, typeof RECIPE_TYPE_CONFIG_T[RecipeTypeKey]][]).map(([key, cfg]) => {
                const isSelected = recipeTypes.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggleRecipeType(key)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left border transition-all ${
                      isSelected
                        ? cfg.color
                        : "border-surface-border bg-card text-muted-foreground hover:bg-surface-hover"
                    }`}
                  >
                    <span className="text-xl shrink-0">{cfg.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight">{cfg.label}</p>
                      <p className="text-[10px] leading-tight opacity-70 truncate">{cfg.desc}</p>
                    </div>
                    {isSelected && (
                      <Check className="size-3.5 shrink-0 opacity-80" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Une envie particulière ── */}
        <div className="space-y-2">
          <label
            htmlFor="preferences"
            className="text-sm font-semibold text-foreground flex items-center gap-1.5"
          >
            <Sparkles className="size-4 text-chart-2" />
            {lang === "fr" ? "Une envie particulière ?" : "Any specific craving?"}
            <span className="text-muted-foreground font-normal text-xs">{lang === "fr" ? "(optionnel — génère 1 seule recette)" : "(optional — generates 1 recipe)"}</span>
          </label>
          <input
            id="preferences"
            type="text"
            value={preferences}
            onChange={(e) => onPreferencesChange(e.target.value)}
            placeholder={lang === "fr" ? "Cuisine italienne, soupe rapide, comfort food…" : "Italian, quick soup, comfort food…"}
            className="w-full rounded-xl border border-surface-border bg-card px-4 py-3 text-base placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
          />
          {preferences.trim() && (
            <p className="text-[11px] text-primary/70 flex items-center gap-1">
              <Sparkles className="size-3" />
              {lang === "fr" ? "1 recette personnalisée sera générée (les types ci-dessus sont ignorés)" : "1 custom recipe will be generated (types above are ignored)"}
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 text-destructive rounded-xl px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Submit */}
        {!hasPhoto && (
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!ingredients.trim() || isAuthLoading}
            size="lg"
            className="w-full h-14 text-lg font-bold rounded-xl gap-2 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-40 disabled:shadow-none"
          >
            <ChefHat className="size-5" />
            {planMode === "single" ? t("suggestMenus") : t("planMyWeek")}
          </Button>
        )}

        {/* Helper text */}
        <p className="text-center text-xs text-muted-foreground/70">
          {lang === "fr" ? "📸 Photo du frigo ou 🧾 ticket de caisse = l'IA détecte tes produits • ✍️ Texte = tu les décris" : "📸 Fridge photo or 🧾 grocery receipt = AI detects your products • ✍️ Text = describe them"}
        </p>
      </div>
    </div>
  );
}
