import React, { useCallback, useState } from "react";
import { UploadCloud, Send, FileBox, Play, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../lib/i18n";

interface InputPaneProps {
  onStageImage: (blob: Blob) => void;
  onSubmit: () => void;
  textInput: string;
  setTextInput: (v: string) => void;
  language: string;
  detectedQuestions?: string[];
  activeQuestion?: string;
  onSelectQuestion?: (q: string) => void;
  imagePreviewUrl: string | null;
  hasApiKey: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function InputPane({
  onStageImage,
  onSubmit,
  textInput,
  setTextInput,
  language,
  detectedQuestions = [],
  activeQuestion,
  onSelectQuestion,
  imagePreviewUrl,
  hasApiKey,
  isCollapsed,
  onToggleCollapse
}: InputPaneProps) {

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        onStageImage(file);
      }
    },
    [onStageImage]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onStageImage(file);
    }
  };

  return (
    <div className={`w-full shrink-0 border-r border-white/5 flex flex-col transition-all duration-300 overflow-hidden relative bg-[#151515] ${isCollapsed ? 'max-h-12 lg:w-12 lg:max-h-full p-2' : 'max-h-[800px] lg:w-[280px] p-4 space-y-4'}`}>
      <div className="flex justify-between items-center px-1 mb-1 lg:hidden">
         <span className="text-white/40 text-xs font-bold uppercase tracking-wider whitespace-nowrap">{isCollapsed ? "Input" : ""}</span>
         <button onClick={onToggleCollapse} className="text-white/50 hover:text-white transition-colors p-1 rounded-full hover:bg-white/5">
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
         </button>
      </div>
      
      {/* Desktop Arrow Tracker */}
      <div className={`hidden lg:flex ${isCollapsed ? 'justify-center border-b border-white/5 pb-2' : 'justify-between items-center w-full'} mb-2`}>
         {!isCollapsed && <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Input</span>}
         <button onClick={onToggleCollapse} className="text-white/50 hover:text-white transition-colors p-1 rounded hover:bg-white/5">
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
         </button>
      </div>

      <div className={`flex flex-col space-y-4 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div
          className="flex-1 bg-white/5 rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center p-6 text-center overflow-hidden relative group hover:border-[#8b5cf6] transition-colors cursor-pointer min-h-[200px]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="image/*"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            onChange={handleChange}
          />
          {imagePreviewUrl ? (
            <img
              src={imagePreviewUrl}
              className="w-full h-full object-contain pointer-events-none"
              alt=""
            />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <UploadCloud className="w-10 h-10 text-white/30 group-hover:text-[#8b5cf6] transition-colors pointer-events-none" />
              <span className="text-white/20 text-sm font-medium pointer-events-none">
                {t(language, "dropImage")}
              </span>
            </div>
          )}
        </div>

        {detectedQuestions.length > 0 && (
          <div className="bg-white/5 rounded-lg border border-white/10 p-3 flex flex-col gap-2">
            <div className="text-xs text-[#eab308] font-bold uppercase tracking-wider flex items-center gap-2">
              <FileBox className="w-3 h-3" />
              Detected Questions
            </div>
            <div className="flex flex-wrap gap-2">
              {detectedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => onSelectQuestion?.(q)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${activeQuestion === q ? 'bg-[#eab308] text-[#151515] font-bold' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white/5 rounded-lg border border-white/10 flex flex-col focus-within:border-[#14b8a6] transition-colors relative">
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="bg-transparent w-full text-sm outline-none placeholder-white/20 text-white resize-none min-h-[80px] font-sans p-3"
            placeholder={t(language, "placeholder")}
          />
          <div className="flex justify-end p-2 border-t border-white/5">
            <button 
              onClick={onSubmit}
              className="text-[#14b8a6] hover:text-[#5eead4] transition-colors p-2 rounded hover:bg-[#14b8a6]/10 flex items-center justify-center transition-all"
            >
               {hasApiKey ? <Play className="w-5 h-5 fill-current ml-0.5" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
