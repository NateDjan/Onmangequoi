import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fr, en } from "@/i18n";
import type { TranslationKey } from "@/i18n";

type Lang = "fr" | "en";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (key: TranslationKey) => string;
  tArray: (key: TranslationKey) => string[];
}

const translations: Record<Lang, Record<string, string | readonly string[]>> = { fr, en };

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function getBrowserLang(): Lang {
  const stored = localStorage.getItem("omq-lang");
  if (stored === "fr" || stored === "en") return stored;
  const nav = navigator.language?.toLowerCase() || "";
  if (nav.startsWith("fr")) return "fr";
  return "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getBrowserLang);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("omq-lang", newLang);
    document.documentElement.lang = newLang;
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === "fr" ? "en" : "fr");
  }, [lang, setLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key: TranslationKey): string => {
      const val = translations[lang][key];
      if (Array.isArray(val)) return val[0] || key;
      return (val as string) || key;
    },
    [lang],
  );

  const tArray = useCallback(
    (key: TranslationKey): string[] => {
      const val = translations[lang][key];
      if (Array.isArray(val)) return [...val];
      return [(val as string) || key];
    },
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t, tArray }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
