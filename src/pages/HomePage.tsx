import { useAction, useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Check,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  History,
  Mic,
  MicOff,
  Pencil,
  Plus,
  RotateCcw,
  ScanSearch,
  Share2,
  ShoppingCart,
  Sparkles,
  Trash2,
  UserPlus,
  UtensilsCrossed,
  Users,
  WheatOff,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useLanguage } from "@/contexts/LanguageContext";
// pdfToImage is lazy-loaded on demand (only when user uploads a PDF file)
import { useTranslatedConfig } from "@/hooks/useTranslatedConfig";
import { api } from "../../convex/_generated/api";
import { trackGenerateLead, trackCtaClick, trackSearch } from "@/lib/analytics";

// ─── Recipe Type Config ───────────────────────────────
type RecipeTypeKey = "classique" | "allege" | "sport" | "gourmand";
type DietaryConstraintKey = "vegetarien" | "vegan" | "halal" | "casher" | "sans_porc" | "sans_gluten" | "sans_lactose" | "sans_fruits_de_mer" | "sans_noix" | "sans_oeufs" | "sans_soja";

const ALL_DIETARY_CONSTRAINTS: { key: DietaryConstraintKey; emoji: string }[] = [
  { key: "vegetarien", emoji: "🥬" },
  { key: "vegan", emoji: "🌱" },
  { key: "halal", emoji: "☪️" },
  { key: "casher", emoji: "✡️" },
  { key: "sans_porc", emoji: "🚫🐷" },
  { key: "sans_gluten", emoji: "🌾" },
  { key: "sans_lactose", emoji: "🥛" },
  { key: "sans_fruits_de_mer", emoji: "🦐" },
  { key: "sans_noix", emoji: "🥜" },
  { key: "sans_oeufs", emoji: "🥚" },
  { key: "sans_soja", emoji: "🫘" },
];

// ─── Types ────────────────────────────────────────────

interface Menu {
  name: string;
  type?: string;
  description: string;
  cookingTime: string;
  difficulty: string;
  servings: number;
  ingredients: string[];
  steps: string[];
  imagePrompt: string;
  extras: string[];
  calories?: number;
  slot?: string; // e.g. "lun_soir" for weekly mode
  chefName?: string;        // Chef name for "Inspiré de" badge
  chefInspired?: boolean;   // Whether this is a chef-inspired recipe
}

interface DetectedItem {
  name: string;
  confidence: string;
  category: string;
  confirmed: boolean;
  editing: boolean;
}

// Multi-photo entry (frigo, placard, congélateur)
interface PhotoEntry {
  id: string;
  file: File;
  previewUrl: string;
  label: string; // "Frigo", "Placard", "Congélateur"
}

type PlanMode = "single" | "evening" | "noon_eve" | "full";
type Phase = "input" | "analyzing" | "confirm" | "plan" | "loading" | "results";

// ─── Loading Messages ─────────────────────────────────

// Loading/analyzing messages are provided by useTranslatedConfig (LOADING_MESSAGES_T, ANALYZING_MESSAGES_T)

// Category emoji mapping
const CATEGORY_EMOJI: Record<string, string> = {
  "produit laitier": "🥛",
  légume: "🥬",
  fruit: "🍎",
  viande: "🥩",
  poisson: "🐟",
  boisson: "🥤",
  condiment: "🧂",
  féculent: "🍞",
  surgelé: "🧊",
  autre: "📦",
};

// Fetch a Wikipedia thumbnail for a food ingredient name.
// Strategy: try French Wikipedia first (ingredient names are in French),
// then English, then fall back to emoji.
async function fetchWikipediaThumbnail(name: string): Promise<string | null> {
  // Strip adjectives/qualifiers to get the base ingredient (e.g. "Tomates cocktail" → "Tomate")
  const simplified = name
    .replace(/\s+(cocktail|grappe|charnues?|côtelées?\s+noires?|blancs?\s+en\s+botte|rouges?|verts?|jaunes?|fraîches?|frais|en\s+botte|iceberg)\b/gi, "")
    .trim();

  const candidates = [
    simplified,   // "Tomate"
    name,         // "Tomates cocktail" (original)
  ].filter(Boolean);

  for (const term of candidates) {
    for (const lang of ["fr", "en"]) {
      try {
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) continue;
        const data = await res.json();
        const thumb = data?.thumbnail?.source as string | undefined;
        if (thumb) return thumb;
      } catch {
        // try next
      }
    }
  }
  return null;
}

// Small thumbnail for each ingredient — lazy loads Wikipedia photo, falls back to emoji
function IngredientThumbnail({ name, fallbackEmoji }: { name: string; fallbackEmoji: string }) {
  const [src, setSrc] = useState<string | null>(() => {
    // Check localStorage cache on init to avoid flash
    const cached = localStorage.getItem(`ing_thumb_v2_${name.toLowerCase().trim()}`);
    if (cached && cached !== "failed") return cached;
    return null;
  });
  const [failed, setFailed] = useState(() => {
    return localStorage.getItem(`ing_thumb_v2_${name.toLowerCase().trim()}`) === "failed";
  });

  useEffect(() => {
    if (src || failed) return; // Already resolved
    const cacheKey = `ing_thumb_v2_${name.toLowerCase().trim()}`;
    fetchWikipediaThumbnail(name).then((url) => {
      if (url) {
        localStorage.setItem(cacheKey, url);
        setSrc(url);
      } else {
        localStorage.setItem(cacheKey, "failed");
        setFailed(true);
      }
    });
  }, [name, src, failed]);

  if (failed || !src) {
    return <span className="text-lg shrink-0">{fallbackEmoji}</span>;
  }

  return (
    <img
      src={src}
      alt={name}
      className="size-8 rounded-lg object-cover shrink-0 border border-surface-border-strong"
      onError={() => {
        const cacheKey = `ing_thumb_v2_${name.toLowerCase().trim()}`;
        localStorage.setItem(cacheKey, "failed");
        setSrc(null);
        setFailed(true);
      }}
    />
  );
}

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
        <LoadingSection
          message={ANALYZING_MESSAGES_T[loadingMsgIndex % ANALYZING_MESSAGES_T.length]}
          subtitle={t("aiAnalysisSub")}
          emojis={["📸", "🔍", "🧠"]}
        />
      )}

      {phase === "confirm" && (
        <ConfirmSection
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
        />
      )}

      {phase === "plan" && (
        <PlanSection
          planMode={planMode}
          preferences={preferences}
          dietaryConstraints={dietaryConstraints}
          onPlanModeChange={setPlanMode}
          onPreferencesChange={setPreferences}
          onGenerate={phase === "plan" && detectedItems.length > 0
            ? handleGenerateFromPlan
            : handleGenerateFromPlanText
          }
        />
      )}

      {phase === "loading" && (
        <LoadingSection
          message={LOADING_MESSAGES_T[loadingMsgIndex % LOADING_MESSAGES_T.length]}
          subtitle={lang === "fr" ? "Ça arrive, promis !" : "Coming right up!"}
          emojis={["🥘", "🍳", "🥗"]}
        />
      )}

      {phase === "results" && (
        <ResultsSection
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
        />
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
  const FALLBACK_HERO = "https://v3b.fal.media/files/b/0a9e2dd8/YGBUgaJS0b16Ug_xC_D-J.jpg";
  const heroSrc = heroImage?.imageUrl ?? FALLBACK_HERO;
  const heroDishName = heroImage?.dishName;

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-8 md:py-12 animate-fade-in-up">
      <div className="w-full max-w-md space-y-5">
        {/* Hero — food photo with gradient overlay */}
        <div className="relative rounded-3xl overflow-hidden mb-1" style={{height: '220px'}}>
          <img
            src={heroSrc}
            alt={heroDishName ?? "Plat du jour"}
            className="w-full h-full object-cover"
            style={{objectPosition: 'center 40%'}}
          />
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

// ─── Plan Section (choose when + craving) ────────────

const PLAN_OPTIONS: { mode: PlanMode; emoji: string; labelFr: string; labelEn: string; descFr: string; descEn: string }[] = [
  { mode: "single", emoji: "🍽️", labelFr: "Ce soir", labelEn: "Tonight", descFr: "Un seul repas pour maintenant", descEn: "One meal for right now" },
  { mode: "evening", emoji: "🌙", labelFr: "Tous les soirs", labelEn: "All evenings", descFr: "Un plat par soir cette semaine", descEn: "One dish every evening this week" },
  { mode: "noon_eve", emoji: "☀️🌙", labelFr: "Midi & soir", labelEn: "Lunch & dinner", descFr: "Deux repas par jour, toute la semaine", descEn: "Two meals a day, all week" },
  { mode: "full", emoji: "📅", labelFr: "Semaine complète", labelEn: "Full week", descFr: "3 repas par jour, 7 jours", descEn: "3 meals a day, 7 days" },
];

const CRAVING_OPTIONS_FR = [
  { emoji: "🍝", label: "Pasta / Riz" },
  { emoji: "🥗", label: "Légumes / Salade" },
  { emoji: "🥩", label: "Viande" },
  { emoji: "🐟", label: "Poisson" },
  { emoji: "🌶️", label: "Épicé" },
  { emoji: "⏱️", label: "Rapide" },
  { emoji: "🫕", label: "Comfort food" },
  { emoji: "💪", label: "Fit / Healthy" },
];

function PlanSection({
  planMode,
  preferences,
  onPlanModeChange,
  onPreferencesChange,
  onGenerate,
}: {
  planMode: PlanMode;
  preferences: string;
  dietaryConstraints: DietaryConstraintKey[];
  onPlanModeChange: (v: PlanMode) => void;
  onPreferencesChange: (v: string) => void;
  onGenerate: () => void;
}) {
  const { lang } = useLanguage();
  const [selectedCravings, setSelectedCravings] = useState<string[]>([]);

  const toggleCraving = (label: string) => {
    setSelectedCravings((prev) => {
      const next = prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label];
      // Sync to preferences field
      const base = preferences.replace(/\|cravings:[^|]*/g, "").trim();
      const cravingStr = next.length > 0 ? ` | ${next.join(", ")}` : "";
      onPreferencesChange(base + cravingStr);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-6 md:py-10 animate-fade-in-up">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-4xl mb-2">🗓️</div>
          <h2 className="text-2xl font-bold text-foreground">
            {lang === "fr" ? "Pour quand ?" : "When for?"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {lang === "fr"
              ? "Dis-nous pour combien de repas tu veux cuisiner"
              : "Tell us how many meals you want to plan"}
          </p>
        </div>

        {/* Plan mode tiles */}
        <div className="grid grid-cols-2 gap-3">
          {PLAN_OPTIONS.map((opt) => {
            const isSelected = planMode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() => onPlanModeChange(opt.mode)}
                className={`rounded-2xl p-4 text-left border transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "border-surface-border bg-surface-subtle hover:border-primary/40 hover:bg-surface-hover"
                }`}
              >
                <div className="text-2xl mb-1">{opt.emoji}</div>
                <div className={`text-sm font-bold ${isSelected ? "text-primary" : "text-foreground"}`}>
                  {lang === "fr" ? opt.labelFr : opt.labelEn}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {lang === "fr" ? opt.descFr : opt.descEn}
                </div>
              </button>
            );
          })}
        </div>

        {/* Craving chips */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">
            {lang === "fr" ? "Une envie particulière ? (optionnel)" : "Any particular craving? (optional)"}
          </p>
          <div className="flex flex-wrap gap-2">
            {CRAVING_OPTIONS_FR.map((c) => {
              const isActive = selectedCravings.includes(c.label);
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => toggleCraving(c.label)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    isActive
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-surface-border bg-surface-subtle text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <span>{c.emoji}</span>
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Free preference field */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">
            {lang === "fr" ? "Autre envie ou contrainte ?" : "Any other craving or constraint?"}
          </label>
          <textarea
            value={preferences}
            onChange={(e) => onPreferencesChange(e.target.value)}
            rows={2}
            placeholder={lang === "fr" ? "Ex : sans gluten, repas romantique, cuisine asiatique…" : "e.g. gluten-free, romantic dinner, Asian cuisine…"}
            className="w-full bg-surface-subtle border border-surface-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
        </div>

        {/* Generate button */}
        <Button
          type="button"
          onClick={onGenerate}
          size="lg"
          className="w-full h-14 text-lg font-bold rounded-xl gap-2 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
        >
          <Sparkles className="size-5" />
          {lang === "fr"
            ? planMode === "single" ? "✨ Voir les menus" : "✨ Planifier ma semaine"
            : planMode === "single" ? "✨ See menus" : "✨ Plan my week"
          }
        </Button>
      </div>
    </div>
  );
}

// ─── Confirm Section (after photo analysis) ───────────

function ConfirmSection({
  photoPreview,
  summary,
  items,
  preferences,
  newItemName,
  error,
  onPreferencesChange,
  onToggleItem,
  onEditItem,
  onSaveEdit,
  onRemoveItem,
  onNewItemNameChange,
  onAddItem,
  onConfirm,
  onRestart,
}: {
  photoPreview: string | null;
  summary: string;
  items: DetectedItem[];
  preferences: string;
  newItemName: string;
  error: string | null;
  onPreferencesChange: (v: string) => void;
  onToggleItem: (index: number) => void;
  onEditItem: (index: number) => void;
  onSaveEdit: (index: number, name: string) => void;
  onRemoveItem: (index: number) => void;
  onNewItemNameChange: (v: string) => void;
  onAddItem: () => void;
  onConfirm: () => void;
  onRestart: () => void;
}) {
  const { t, lang } = useLanguage();
  const confirmedCount = items.filter((i) => i.confirmed).length;

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-6 md:py-10 animate-fade-in-up">
      <div className="w-full max-w-md space-y-5">
        {/* Header with photo thumbnail */}
        <div className="flex items-start gap-3">
          {photoPreview && (
            <img
              src={photoPreview}
              alt={lang === "fr" ? "Ta photo" : "Your photo"}
              className="size-16 rounded-xl object-cover border border-border shadow-sm shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold shimmer-gold">
              {items.some((i) => i.confidence !== "suggestion") ? t("hereIsWhatISee") : t("whatInKitchen")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
              {summary}
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-surface-subtle border border-surface-border rounded-xl px-4 py-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">{t("verifyIngredients")}</strong> — {lang === "fr" ? "coche ✅ ceux que tu veux utiliser, corrige les erreurs avec ✏️, ou ajoute ce qui manque." : "check ✅ those you want to use, fix errors with ✏️, or add what's missing."}
          </p>
        </div>

        {/* Detected items list */}
        <div className="space-y-2">
          {items.map((item, index) => (
            <IngredientRow
              key={`${item.name}-${index}`}
              item={item}
              index={index}
              onToggle={onToggleItem}
              onEdit={onEditItem}
              onSaveEdit={onSaveEdit}
              onRemove={onRemoveItem}
            />
          ))}
        </div>

        {/* Add custom item */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => onNewItemNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddItem()}
            placeholder={lang === "fr" ? "Ajouter un ingrédient…" : "Add an ingredient…"}
            className="flex-1 rounded-xl border border-input bg-card px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/50 transition shadow-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddItem}
            disabled={!newItemName.trim()}
            className="h-10 rounded-xl gap-1 px-3"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {/* Preferences */}
        <div className="space-y-2">
          <label
            htmlFor="preferences-confirm"
            className="text-sm font-semibold text-foreground flex items-center gap-1.5"
          >
            <Sparkles className="size-4 text-chart-2" />
            {lang === "fr" ? "Une envie ?" : "Any craving?"}
            <span className="text-muted-foreground font-normal">{lang === "fr" ? "(optionnel)" : "(optional)"}</span>
          </label>
          <input
            id="preferences-confirm"
            type="text"
            value={preferences}
            onChange={(e) => onPreferencesChange(e.target.value)}
            placeholder={lang === "fr" ? "Rapide, comfort food, cuisine asiatique…" : "Quick, comfort food, Asian cuisine…"}
            className="w-full rounded-xl border border-surface-border bg-card px-4 py-3 text-base placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 text-destructive rounded-xl px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Confirm button */}
        <Button
          type="button"
          onClick={onConfirm}
          disabled={confirmedCount === 0}
          size="lg"
          className="w-full h-14 text-lg font-bold rounded-xl gap-2 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-40 disabled:shadow-none"
        >
          <ChefHat className="size-5" />
          {lang === "fr" ? `Proposer des menus (${confirmedCount} ingrédient${confirmedCount > 1 ? "s" : ""})` : `Suggest menus (${confirmedCount} ingredient${confirmedCount > 1 ? "s" : ""})`}
        </Button>

        {/* Restart */}
        <button
          type="button"
          onClick={onRestart}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition py-2"
        >
          {lang === "fr" ? "← Recommencer" : "← Start over"}
        </button>
      </div>
    </div>
  );
}

// ─── Ingredient Row ───────────────────────────────────

function IngredientRow({
  item,
  index,
  onToggle,
  onEdit,
  onSaveEdit,
  onRemove,
}: {
  item: DetectedItem;
  index: number;
  onToggle: (i: number) => void;
  onEdit: (i: number) => void;
  onSaveEdit: (i: number, name: string) => void;
  onRemove: (i: number) => void;
}) {
  const { lang } = useLanguage();
  const [editValue, setEditValue] = useState(item.name);
  const emoji = CATEGORY_EMOJI[item.category] || "📦";
  const isUncertain = item.confidence === "basse" || item.confidence === "moyenne";

  if (item.editing) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-xl bg-card border border-primary/30 shadow-sm">
        <IngredientThumbnail name={item.name} fallbackEmoji={emoji} />
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSaveEdit(index, editValue)}
          autoFocus
          className="flex-1 bg-transparent text-sm font-medium focus:outline-none"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSaveEdit(index, editValue)}
          className="h-7 w-7 p-0 shrink-0"
        >
          <Check className="size-4 text-primary" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
        item.confirmed
          ? "bg-card border-surface-border shadow-sm"
          : "bg-surface-subtle border-surface-border opacity-50"
      } ${isUncertain && !item.confirmed ? "border-chart-2/40 bg-chart-2/5" : ""}`}
    >
      {/* Toggle checkbox */}
      <button
        type="button"
        onClick={() => onToggle(index)}
        className={`shrink-0 size-6 rounded-lg border-2 flex items-center justify-center transition ${
          item.confirmed
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/30 hover:border-primary/50"
        }`}
      >
        {item.confirmed && <Check className="size-3.5" />}
      </button>

      {/* Ingredient thumbnail */}
      <IngredientThumbnail name={item.name} fallbackEmoji={emoji} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{item.name}</span>
        {isUncertain && (
          <span className="text-xs text-chart-2 font-medium">
            {lang === "fr" ? "Pas sûr — corrige si besoin" : "Not sure — correct if needed"}
          </span>
        )}
      </div>

      {/* Edit button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onEdit(index)}
        className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </Button>

      {/* Remove button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

// Ad placement handled entirely by Google Auto Ads (activated on AdSense account).

// ─── Loading Section ──────────────────────────────────

function LoadingSection({
  message,
  subtitle,
  emojis,
}: {
  message: string;
  subtitle: string;
  emojis: string[];
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
      <div className="text-center space-y-8">
        {/* Emoji animation */}
        <div className="flex items-end justify-center gap-3 text-4xl">
          <span className="animate-bounce-cook">{emojis[0]}</span>
          <span className="animate-bounce-cook-delayed">{emojis[1]}</span>
          <span className="animate-bounce-cook-delayed-2">{emojis[2]}</span>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <p className="text-lg font-semibold shimmer-gold transition-all duration-500">
            {message}
          </p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="size-2 rounded-full bg-primary/60 animate-pulse"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>


      </div>
    </div>
  );
}

// ─── Results Section ──────────────────────────────────

function ResultsSection({
  menus,
  menuImages,
  expandedMenu,
  isAuthenticated,
  historySaved,
  planMode,
  onToggleExpand,
  onRestart,
  onNavigateSignup,
  onNavigateHistory,
  onImageLoaded,
}: {
  menus: Menu[];
  menuImages: Record<number, string>;
  expandedMenu: number | null;
  isAuthenticated: boolean;
  historySaved: boolean;
  planMode: PlanMode;
  onToggleExpand: (index: number | null) => void;
  onRestart: () => void;
  onNavigateSignup: () => void;
  onNavigateHistory: () => void;
  onImageLoaded: (index: number) => void;
}) {
  const { lang } = useLanguage();
  const { SLOT_DAY_LABEL: SLOT_DAY_LABEL_T, SLOT_MEAL_LABEL: SLOT_MEAL_LABEL_T } = useTranslatedConfig();
  const isWeekly = planMode !== "single";

  // Group menus by day for weekly display
  const byDay: Array<{ day: string; dayLabel: string; items: Array<{ menu: Menu; index: number }> }> = [];
  if (isWeekly) {
    const DAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
    for (const day of DAYS) {
      const items = menus
        .map((m, i) => ({ menu: m, index: i }))
        .filter(({ menu }) => menu.slot?.startsWith(day + "_"));
      if (items.length > 0) {
        byDay.push({ day, dayLabel: SLOT_DAY_LABEL_T[day] || day, items });
      }
    }
  }

  return (
    <div className="flex-1 px-4 py-8 md:py-12">
      <div className="max-w-md mx-auto space-y-6 stagger-children">
        {/* Header */}
        <div className="text-center space-y-1">
          {isWeekly ? (
            <>
              <h2 className="text-2xl font-bold text-gold">{lang === "fr" ? "Ton planning de la semaine ! 📅" : "Your weekly meal plan! 📅"}</h2>
              <p className="text-muted-foreground text-sm">
                {lang === "fr" ? `${menus.length} repas préparés avec tes ingrédients` : `${menus.length} meals prepared with your ingredients`}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gold">{lang === "fr" ? "Voilà mes suggestions ! 👨‍🍳" : "Here are my suggestions! 👨‍🍳"}</h2>
              <p className="text-muted-foreground text-sm">
                {lang === "fr"
                  ? `${menus.length} idée${menus.length > 1 ? "s" : ""} pour régaler tes papilles`
                  : `${menus.length} idea${menus.length > 1 ? "s" : ""} to treat your taste buds`}
              </p>
            </>
          )}
        </div>

        {/* Save status / signup prompt */}
        {isAuthenticated && historySaved && (
          <div className="flex items-center justify-center gap-2 bg-primary/5 rounded-xl px-4 py-2.5 text-sm">
            <Bookmark className="size-4 text-primary" />
            <span className="text-muted-foreground">
              {lang === "fr" ? "Sauvegardé dans ton" : "Saved to your"}{" "}
              <button
                type="button"
                onClick={onNavigateHistory}
                className="font-semibold text-primary hover:underline"
              >
                {lang === "fr" ? "historique" : "history"}
              </button>
            </span>
          </div>
        )}
        {!isAuthenticated && (() => {
          const usedToday = getAnonymousUsageToday();
          const remaining = Math.max(0, ANON_DAILY_LIMIT - usedToday);
          return (
            <button
              type="button"
              onClick={onNavigateSignup}
              className="w-full flex items-center gap-3 bg-primary/10 hover:bg-primary/15 border border-primary/20 rounded-xl px-4 py-3.5 transition text-left group"
            >
              <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/30 transition">
                <UserPlus className="size-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">
                  {lang === "fr"
                    ? remaining > 0
                      ? "💾 Crée un compte gratuit pour continuer"
                      : "🔒 Crée un compte gratuit pour continuer"
                    : remaining > 0
                      ? "💾 Create a free account to continue"
                      : "🔒 Create a free account to continue"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === "fr"
                    ? remaining > 0
                      ? "Sans CB · 2 recettes/jour · sauvegarde ton historique"
                      : "Tu as utilisé ta génération gratuite · sans CB · 2 recettes/jour incluses"
                    : remaining > 0
                      ? "No credit card · 2 recipes/day · save your history"
                      : "Free generation used · no credit card · 2 recipes/day included"}
                </p>
              </div>
              <History className="size-4 text-primary/50 shrink-0" />
            </button>
          );
        })()}

        {/* Menu cards — weekly grouped or single */}
        {isWeekly ? (
          byDay.map(({ day, dayLabel, items }) => (
            <div key={day} className="space-y-3">
              {/* Day header */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-sm font-bold text-primary px-2">{dayLabel}</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              {items.map(({ menu, index }) => {
                const [, meal] = (menu.slot || "").split("_");
                return (
                  <div key={index}>
                    {meal && (
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5 ml-1">
                        {SLOT_MEAL_LABEL_T[meal] || meal}
                      </p>
                    )}
                    <MenuCard
                      menu={menu}
                      index={index}
                      imageUrl={menuImages[index]}
                      isExpanded={expandedMenu === index}
                      onToggle={() => onToggleExpand(expandedMenu === index ? null : index)}
                      onImageLoaded={() => onImageLoaded(index)}
                    />
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          menus.map((menu, index) => (
            <MenuCard
              key={menu.name}
              menu={menu}
              index={index}
              imageUrl={menuImages[index]}
              isExpanded={expandedMenu === index}
              onToggle={() =>
                onToggleExpand(expandedMenu === index ? null : index)
              }
              onImageLoaded={() => onImageLoaded(index)}
            />
          ))
        )}

        {/* Actions */}
        <div className="space-y-3 pt-2">
          {isAuthenticated && (
            <Button
              type="button"
              variant="outline"
              onClick={onNavigateHistory}
              className="w-full h-11 rounded-xl gap-2 text-sm font-semibold border-border/80 hover:bg-secondary"
            >
              <History className="size-4" />
              {lang === "fr" ? "Voir mon historique" : "View my history"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onRestart}
            className="w-full h-12 rounded-xl gap-2 text-base font-semibold border-border/80 hover:bg-secondary"
          >
            <RotateCcw className="size-4" />
            {lang === "fr" ? "Recommencer" : "Start over"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Menu Card ────────────────────────────────────────

function MenuCard({
  menu,
  index,
  imageUrl,
  isExpanded,
  onToggle,
  onImageLoaded,
}: {
  menu: Menu;
  index: number;
  imageUrl?: string;
  isExpanded: boolean;
  onToggle: () => void;
  onImageLoaded?: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | undefined>(imageUrl);
  const [shareCopied, setShareCopied] = useState(false);
  const { lang } = useLanguage();
  const retryCountRef = React.useRef(0);

  // Native share — sends photo + recipe text via OS share sheet
  const handleNativeShare = async () => {
    const lines = [
      `🍽️ ${menu.name}`,
      ``,
      menu.description,
      ``,
      `⏱️ ${menu.cookingTime} • ${menu.difficulty} • ${menu.servings} pers.`,
      ``,
      `🥕 ${lang === "fr" ? "Ingrédients" : "Ingredients"} :`,
      ...menu.ingredients.map((i: string) => `• ${i}`),
      ``,
      `📝 ${lang === "fr" ? "Préparation" : "Instructions"} :`,
      ...menu.steps.map((s: string, idx: number) => `${idx + 1}. ${s}`),
      ``,
      lang === "fr" ? `Recette générée avec On Mange Quoi ? 👉 onmangequoi.net` : `Recipe generated with On Mange Quoi? 👉 onmangequoi.net`,
    ];
    const shareText = lines.join("\n");
    const shareTitle = `${menu.name} — On Mange Quoi ?`;

    if (navigator.share) {
      try {
        if (imgSrc && navigator.canShare) {
          const response = await fetch(imgSrc).catch(() => null);
          if (response?.ok) {
            const blob = await response.blob();
            const file = new File([blob], `${menu.name.replace(/\s+/g, "-")}.jpg`, { type: blob.type || "image/jpeg" });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ title: shareTitle, text: shareText, files: [file] });
              return;
            }
          }
        }
        await navigator.share({ title: shareTitle, text: shareText, url: "https://onmangequoi.net" });
      } catch { /* user cancelled */ }
    } else {
      // Desktop fallback: copy text to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      } catch { /* ignore */ }
    }
  };

  // Sync src when imageUrl prop changes
  React.useEffect(() => {
    setImgSrc(imageUrl);
    setImgLoaded(false);
    setImgError(false);
    retryCountRef.current = 0;
  }, [imageUrl]);

  const handleImgError = () => {
    if (retryCountRef.current < 3 && imgSrc) {
      retryCountRef.current += 1;
      const delay = retryCountRef.current * 4000;
      setTimeout(() => {
        // Cache-bust by adding a retry param
        const sep = imgSrc.includes("?") ? "&" : "?";
        setImgSrc(`${imgSrc.split("&_r=")[0]}${sep}_r=${retryCountRef.current}`);
        setImgError(false);
      }, delay);
    } else {
      setImgError(true);
    }
  };

  const handleManualRefresh = () => {
    if (!imgSrc && !imageUrl) return;
    const base = (imgSrc || imageUrl || "").split("&_r=")[0];
    const manualRetry = Date.now() % 10000; // unique bust
    const sep = base.includes("?") ? "&" : "?";
    setImgSrc(`${base}${sep}_r=${manualRetry}`);
    setImgLoaded(false);
    setImgError(false);
    retryCountRef.current = 0;
  };

  const difficultyColor =
    menu.difficulty === "Facile"
      ? "text-success"
      : menu.difficulty === "Difficile"
        ? "text-chart-4"
        : "text-chart-2";

  const typeConfig: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
    "peu calorique": { emoji: "🥗", label: "Léger & Régime", bg: "bg-emerald-950/60", text: "text-emerald-400" },
    "sport":         { emoji: "💪", label: "Sport & Énergie", bg: "bg-blue-950/60",    text: "text-blue-400" },
    "gourmande":     { emoji: "🍫", label: "Gourmand",        bg: "bg-amber-950/60",   text: "text-amber-400" },
  };
  const typeKey = (menu.type || "").toLowerCase();
  const typeInfo = typeConfig[typeKey];

  return (
    <div className="card-premium rounded-2xl border border-surface-border bg-card overflow-hidden shadow-lg">
      {/* Image */}
      <div className="aspect-[16/10] bg-muted relative overflow-hidden">
        {imgSrc && !imgError && (
          <img
            src={imgSrc}
            alt={menu.name}
            className={`w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0 absolute"}`}
            onLoad={() => { setImgLoaded(true); onImageLoaded?.(); }}
            onError={handleImgError}
          />
        )}
        {(!imgSrc || !imgLoaded || imgError) && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <div className="text-3xl animate-pulse">
              {["🥗", "💪", "🍫"][index % 3]}
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              {lang === "fr" ? "📸 Génération de la photo…" : "📸 Generating photo…"}
            </p>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="size-1.5 rounded-full bg-primary/40 animate-pulse"
                  style={{ animationDelay: `${i * 0.3}s` }}
                />
              ))}
            </div>
          </div>
        )}
        {/* Type badge overlaid on image */}
        {typeInfo && (
          <div className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm ${typeInfo.bg} ${typeInfo.text}`}>
            <span>{typeInfo.emoji}</span>
            <span>{typeInfo.label}</span>
          </div>
        )}
        {/* Chef-inspired badge */}
        {menu.chefInspired && menu.chefName && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shadow-lg bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-white backdrop-blur-sm">
            <span>👨‍🍳</span>
            <span>{lang === "fr" ? `Inspiré du Chef ${menu.chefName}` : `Inspired by Chef ${menu.chefName}`}</span>
          </div>
        )}
        {/* Manual refresh button — always accessible, bottom-right corner */}
        <button
          onClick={(e) => { e.stopPropagation(); handleManualRefresh(); }}
          title={lang === "fr" ? "Regénérer l'image" : "Regenerate image"}
          className="absolute bottom-2 right-2 size-7 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/70 transition-all duration-200 opacity-60 hover:opacity-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-lg font-bold leading-tight">{menu.name}</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {menu.description}
          </p>
        </div>

        {/* Meta badges */}
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary">
            <Clock className="size-3 text-chart-3" />
            {menu.cookingTime}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary ${difficultyColor}`}
          >
            <Flame className="size-3" />
            {menu.difficulty}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary">
            <Users className="size-3 text-chart-5" />
            {menu.servings} pers.
          </span>
          {menu.calories != null && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-chart-2 font-semibold">
              🔥 {menu.calories} kcal
            </span>
          )}
        </div>

        {/* Expandable recipe */}
        {isExpanded && (
          <div className="space-y-4 pt-2 border-t border-border/50 animate-fade-in-up">
            {/* Ingredients */}
            <div>
              <h4 className="text-sm font-bold flex items-center gap-1.5 mb-2">
                <span className="text-base">🥕</span> {lang === "fr" ? "Ingrédients" : "Ingredients"}
              </h4>
              <ul className="space-y-1">
                {menu.ingredients.map((ing) => (
                  <li
                    key={ing}
                    className="text-sm text-muted-foreground flex items-start gap-2"
                  >
                    <span className="text-primary mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                    {ing}
                  </li>
                ))}
              </ul>
            </div>

            {/* Steps */}
            <div>
              <h4 className="text-sm font-bold flex items-center gap-1.5 mb-2">
                <span className="text-base">📝</span> {lang === "fr" ? "Préparation" : "Instructions"}
              </h4>
              <ol className="space-y-2">
                {menu.steps.map((step, i) => (
                  <li key={step} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 size-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground leading-relaxed">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Extras — optional ingredients to buy (with Amazon affiliate links) */}
            {menu.extras && menu.extras.length > 0 && (
              <div className="bg-chart-2/10 rounded-xl p-3 affiliate-section" data-noads="true">
                <h4 className="text-sm font-bold flex items-center gap-1.5 mb-2 text-chart-2">
                  <ShoppingCart className="size-4" />
                  {lang === "fr" ? "Pour aller plus loin (optionnel)" : "Go further (optional)"}
                </h4>
                <ul className="space-y-1.5">
                  {menu.extras.map((extra) => {
                    // Extract just the ingredient name (remove quantity/unit prefix like "1 c.à.s de ")
                    const ingredientName = extra
                      .replace(/^\d+[\s,.]*(g|kg|cl|ml|L|c\.à\.s|c\.à\.c|cuillère[s]?[^\s]*|pincée[s]?|filet|poignée[s]?|tranche[s]?|morceau[x]?)?\s+(de\s+|d['']\s*)?/i, "")
                      .trim();
                    // Amazon affiliate search URL (tag to be replaced with real affiliate ID)
                    const amazonUrl = `https://www.amazon.fr/s?k=${encodeURIComponent(ingredientName)}&tag=onmangequoi-21`;
                    return (
                      <li
                        key={extra}
                        className="text-sm flex items-center gap-2"
                      >
                        <span className="text-chart-2 mt-0.5 shrink-0">+</span>
                        <span className="text-muted-foreground flex-1">{extra}</span>
                        <a
                          href={amazonUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF9900]/15 hover:bg-[#FF9900]/30 text-[#FF9900] text-xs font-semibold transition-colors"
                          title={`Acheter sur Amazon`}
                          onClick={() => trackCtaClick({ link_url: amazonUrl, cta_name: `amazon_${ingredientName}` })}
                        >
                          🛒 Amazon
                        </a>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted-foreground/50 mt-2">
                  {lang === "fr" ? "* Liens affiliés Amazon — tu soutiens l'app sans frais supplémentaires" : "* Amazon affiliate links — you support the app at no extra cost"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Toggle + Share row */}
        <div className="flex items-center" data-noads="true">
          <button
            type="button"
            onClick={onToggle}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-primary hover:text-primary/80 transition"
          >
            {isExpanded ? (
              <>
                {lang === "fr" ? "Masquer la recette" : "Hide recipe"} <ChevronUp className="size-4" />
              </>
            ) : (
              <>
                {lang === "fr" ? "Voir la recette" : "View recipe"} <ChevronDown className="size-4" />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleNativeShare}
            className="flex items-center justify-center size-8 rounded-full hover:bg-surface-hover transition text-muted-foreground hover:text-primary"
            title={lang === "fr" ? "Partager" : "Share"}
          >
            <Share2 className="size-4" />
          </button>
          {shareCopied && (
            <span className="text-[11px] text-primary/70 ml-1">✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
