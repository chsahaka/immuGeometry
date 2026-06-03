import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight, Link2, Eye, EyeOff, Save } from "lucide-react";

interface TutorialModalProps {
  onClose: () => void;
  onSave?: (key: string) => void;
  language: string;
}

export default function TutorialModal({ onClose, onSave, language }: TutorialModalProps) {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isInputMode, setIsInputMode] = useState(false);
  const totalSteps = 4;

  const nextStep = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      setIsInputMode(true);
    }
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const getExt = (s: number, type: "desktop" | "phone") => {
    if (type === "phone" && s === 4) return "png";
    if (type === "phone") return "jpg";
    return "png";
  };

  const handleSave = () => {
    if (onSave && apiKey.trim()) {
      onSave(apiKey.trim());
    }
  };

  if (isInputMode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-[#1c1c1e] border border-white/5 w-[360px] rounded-2xl relative shadow-2xl flex flex-col p-6 animate-in zoom-in-95 duration-200">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="mt-8 space-y-6">
            {/* Section 1: Link */}
            <div className="flex flex-col gap-2">
              <span className="text-[#60a5fa] font-mono text-sm font-bold">/1</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="bg-[#242426] hover:bg-[#2c2c2e] transition-colors rounded-xl h-16 flex items-center justify-center border border-white/5 group"
              >
                <Link2 className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" />
              </a>
            </div>

            {/* Section 2: Input */}
            <div className="flex flex-col gap-2">
              <span className="text-[#60a5fa] font-mono text-sm font-bold">/2</span>
              <div className="bg-[#242426] rounded-xl h-16 flex items-center px-4 border border-[#a78bfa]/50 focus-within:border-[#a78bfa] transition-colors">
                <input
                  type={showPassword ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="........................"
                  className="bg-transparent flex-1 outline-none text-white font-mono placeholder-white/30"
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-white/40 hover:text-white ml-2 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="w-full bg-[#a78bfa] hover:bg-[#bba5ff] disabled:opacity-50 text-black font-bold h-14 rounded-xl flex items-center justify-center gap-2 transition-colors mt-4"
            >
              <Save className="w-5 h-5" />
              <span>Save & Continue</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#151515] border border-white/10 rounded-2xl w-full max-w-5xl overflow-hidden flex flex-col shadow-2xl relative transition-all">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 hover:bg-black/80 flex items-center justify-center rounded-full text-white/50 hover:text-white transition-all backdrop-blur-md"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative w-full aspect-[9/16] md:aspect-video bg-[#121212] flex items-center justify-center max-h-[85vh]">
          {/* Desktop Image */}
          <img
            src={`/${step}.png`}
            alt={`Step ${step} Desktop`}
            className="w-full h-full object-contain hidden md:block"
          />
          {/* Mobile Image */}
          <img
            src={`/${step}phone.${getExt(step, "phone")}`}
            alt={`Step ${step} Mobile`}
            className="w-full h-full object-contain md:hidden"
          />
        </div>

        <div className="p-4 md:p-6 flex items-center justify-between border-t border-white/5 bg-[#1a1a1a]">
          <div className="flex gap-2">
            {[...Array(totalSteps)].map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  step === i + 1 ? "w-8 bg-[#14b8a6]" : "w-2 bg-white/20"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={prevStep}
              disabled={step === 1}
              className="p-3 rounded-xl hover:bg-white/5 text-white/50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={nextStep}
              className="px-6 py-3 rounded-xl bg-[#14b8a6] text-[#151515] font-bold hover:bg-[#5eead4] disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {step === totalSteps ? "Finish" : "Next"}
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
