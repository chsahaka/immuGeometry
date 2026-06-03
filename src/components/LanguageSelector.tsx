import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export const LANGUAGES = [
  { code: "EN", country: "us", label: "English" },
  { code: "KH", country: "kh", label: "Khmer" },
  { code: "ES", country: "es", label: "Spanish" },
  { code: "AR", country: "sa", label: "Arabic" },
  { code: "FR", country: "fr", label: "French" },
  { code: "ZH", country: "cn", label: "Chinese" },
];

interface LanguageSelectorProps {
  language: string;
  setLanguage: (lang: string) => void;
}

export default function LanguageSelector({
  language,
  setLanguage,
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-white/40 hover:text-white font-mono font-bold tracking-widest transition-colors py-2 px-3 rounded-full hover:bg-white/5 border border-transparent hover:border-white/10 text-sm"
      >
        <img
          src={`https://flagcdn.com/24x18/${activeLang.country}.png`}
          alt={activeLang.code}
          className="w-4 h-3 object-cover rounded-sm opacity-80"
        />
        {activeLang.code}
        <ChevronDown
          className={`w-4 h-4 ml-1 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 bg-[#1c1c1c] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 min-w-[140px]">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <img
                src={`https://flagcdn.com/24x18/${lang.country}.png`}
                alt={lang.code}
                className="w-4 h-3 object-cover rounded-sm opacity-80"
              />
              <span className="font-sans font-medium">{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
