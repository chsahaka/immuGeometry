import React from "react";
// @ts-ignore
import { InlineMath, BlockMath } from "react-katex";
import { Copy, Check, Play, AlertTriangle, ZapOff } from "lucide-react";
import "katex/dist/katex.min.css";
import { t } from "../lib/i18n";

interface ProofPaneProps {
  proofText: string;
  onExecute: () => void;
  isDemo: boolean;
  language: string;
  apiError?: { message: string; isRateLimit: boolean } | null;
  width?: number;
  engineLogs?: string[];
}

const RATE_LIMIT_TEXTS: Record<string, { title: string; desc: string }> = {
  EN: {
    title: "API Rate Limit Experienced & Reached",
    desc: "The requested Gemini model is experiencing transient high demand spikes, or your API key storage quota has run out. Please pause for a brief moment before retrying, or check your API billing dashboard."
  },
  KH: {
    title: "បានឈានដល់ដែនកំណត់ល្បឿន API",
    desc: "ម៉ូដែល Gemini ដែលបានស្នើសុំកំពុងជួបប្រទះការកើនឡើងនៃតម្រូវការបណ្តោះអាសន្ន ឬកូតាសោ API របស់អ្នកត្រូវបានប្រើប្រាស់អស់។ សូមរង់ចាំមួយភ្លែតមុនពេលព្យាយាមម្តងទៀត ឬពិនិត្យផ្ទាំងគ្រប់គ្រងការទូទាត់ API របស់អ្នក។"
  },
  ES: {
    title: "Límite de tasa de API alcanzado",
    desc: "El modelo Gemini solicitado está experimentando picos temporales de alta demanda o la cuota de su clave API se ha agotado. Espere unos momentos antes de volver a intentarlo o verifique su panel de facturación de API."
  },
  FR: {
    title: "Limite de taux de l'API atteinte",
    desc: "Le modèle Gemini demandé subit temporairement des pics de forte demande ou le quota de votre clé API est épuisé. Veuillez patienter quelques instants avant de réessayer ou vérifiez votre tableau de bord de facturation API."
  },
  ZH: {
    title: "已达到 API 频率限制",
    desc: "请求的 Gemini 模型正面临临时的极高需求量，或者您的 API 密钥配额已耗尽。请稍等片刻后重试，或检查您的 API 账单信息。"
  },
  AR: {
    title: "تم الوصول إلى حد معدل واجهة برمجة التطبيقات",
    desc: "يواجه نموذج Gemini المطلوب ارتفاعًا مؤقتًا في الطلب أو تم استنفاد حصة مفتاح API الخاص بك. يرجى الانتظار بضع لحظات قبل إعادة المحاولة، أو التحقق من لوحة معلومات الفواتير الخاصة بالواجهة."
  }
};

export default function ProofPane({
  proofText,
  onExecute,
  isDemo,
  language,
  apiError,
  width = 320,
  engineLogs = []
}: ProofPaneProps) {
  const [copied, setCopied] = React.useState(false);

  const [isLg, setIsLg] = React.useState(window.innerWidth >= 1024);
  React.useEffect(() => {
    const handleResize = () => setIsLg(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(proofText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const parseInlineStyles = (text: string) => {
    // Basic bold parser inside plain text: **boldText**
    const boldParts = text.split(/(\*\*[\s\S]*?\*\*)/g);
    return boldParts.map((bPart, bIdx) => {
      if (bPart.startsWith("**") && bPart.endsWith("**")) {
        return <strong key={bIdx} className="font-bold text-white font-sans">{bPart.slice(2, -2)}</strong>;
      }
      return bPart;
    });
  };

  const renderMathElements = (text: string) => {
    // Regex to split by $$, $, \(, and \[
    const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g);

    return parts.map((part, index) => {
      if (part.startsWith("$$") && part.endsWith("$$")) {
        return (
          <div
            key={index}
            className="text-lg text-center p-4 bg-white/[0.02] rounded-lg my-2 border border-white/5"
          >
            <BlockMath math={part.slice(2, -2)} />
          </div>
        );
      } else if (part.startsWith("$") && part.endsWith("$")) {
        return <InlineMath key={index} math={part.slice(1, -1)} settings={{ strict: "ignore", trust: true, throwOnError: false }} />;
      } else if (part.startsWith("\\(") && part.endsWith("\\)")) {
        return <InlineMath key={index} math={part.slice(2, -2)} settings={{ strict: "ignore", trust: true, throwOnError: false }} />;
      } else if (part.startsWith("\\[") && part.endsWith("\\]")) {
        return (
          <div
            key={index}
            className="text-lg text-center p-4 bg-white/[0.02] rounded-lg my-2 border border-white/5"
          >
            <BlockMath math={part.slice(2, -2)} settings={{ strict: "ignore", trust: true, throwOnError: false }} />
          </div>
        );
      }
      
      // Parse basic markdown in non-math parts
      const lines = part.split("\n");
      return (
        <span key={index}>
          {lines.map((line, lIdx) => {
            let element: React.ReactNode = line;
            
            if (line.trim().startsWith("### ")) {
              const content = line.trim().substring(4);
              element = <h3 className="text-base font-bold text-white mt-4 mb-2 tracking-wide font-sans">{parseInlineStyles(content)}</h3>;
            } else if (line.trim().startsWith("## ")) {
              const content = line.trim().substring(3);
              element = <h2 className="text-lg font-bold text-white mt-5 mb-2.5 tracking-wide font-sans">{parseInlineStyles(content)}</h2>;
            } else if (line.trim().startsWith("# ")) {
              const content = line.trim().substring(2);
              element = <h1 className="text-xl font-bold text-white mt-6 mb-3 tracking-wide font-sans">{parseInlineStyles(content)}</h1>;
            } else if (line.trim() === "---") {
              element = <hr className="my-4 border-t border-white/10" />;
            } else {
              element = <span className="block mb-1.5">{parseInlineStyles(line)}</span>;
            }
            
            return <React.Fragment key={lIdx}>{element}</React.Fragment>;
          })}
        </span>
      );
    });
  };

  return (
    <div 
      className="w-full shrink-0 lg:h-full border-l border-white/5 flex flex-col p-6 overflow-hidden"
      style={{ width: isLg ? `${width}px` : '100%' }}
    >
      <div className="flex-1 space-y-4 font-serif leading-relaxed text-white/80 whitespace-pre-wrap overflow-y-auto no-scrollbar pb-6 flex flex-col justify-start">
        {apiError && apiError.isRateLimit ? (
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-200/90 font-sans text-sm pr-4 flex flex-col gap-3 shadow-[0_8px_32px_rgba(245,158,11,0.05)] mb-2">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-amber-300 text-xs tracking-wide leading-snug">
                  {(RATE_LIMIT_TEXTS[language] || RATE_LIMIT_TEXTS.EN).title}
                </h4>
                <p className="text-[11px] text-amber-200/60 leading-relaxed font-normal">
                  {(RATE_LIMIT_TEXTS[language] || RATE_LIMIT_TEXTS.EN).desc}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col gap-1 mt-1 bg-black/35 p-2.5 rounded-lg border border-white/5 font-mono text-[10px] text-amber-400/80 break-all max-h-24 overflow-y-auto no-scrollbar">
              <span className="font-semibold text-white/30 block pb-1 border-b border-white/5 uppercase tracking-wider text-[8px]">Diagnostics Log</span>
              <span>{apiError.message}</span>
            </div>
          </div>
        ) : null}

        {proofText.includes(t(language, "processing")) || (!proofText && engineLogs.length > 0) ? (
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-center text-white/40 font-sans text-sm italic tracking-wide animate-pulse py-8">
              {proofText || "Processing..."}
            </div>
            {engineLogs.length > 0 && (
              <div className="flex flex-col gap-2 p-4 rounded-xl border border-[#818cf8]/20 bg-[#818cf8]/5 mt-auto max-h-[300px] overflow-y-auto font-mono text-[11px] text-[#818cf8]/80 shadow-[0_0_20px_rgba(129,140,248,0.05)]">
                <span className="font-semibold text-[#818cf8]/50 block pb-2 border-b border-[#818cf8]/20 uppercase tracking-wider text-[9px] mb-1">
                  Engine Thinking Stream
                </span>
                {engineLogs.map((log, idx) => (
                  <div key={idx} className="leading-snug break-all">{log}</div>
                ))}
              </div>
            )}
          </div>
        ) : proofText ? (
          renderMathElements(proofText)
        ) : null}
      </div>

      <div className="pt-6 border-t border-white/5 flex justify-between items-center mt-auto">
        <button 
          onClick={handleCopy}
          className="p-3 rounded-full bg-white/5 text-white/40 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
        <button
          onClick={onExecute}
          className="px-8 py-3 rounded-full bg-[#818cf8] text-white font-bold text-sm tracking-widest hover:bg-[#a5b4fc] transition-colors shadow-[0_0_15px_rgba(129,140,248,0.2)] flex items-center justify-center min-w-[120px]"
        >
          {isDemo ? t(language, "tryItOut") : <Play className="w-5 h-5 fill-current" />}
        </button>
      </div>
    </div>
  );
}
