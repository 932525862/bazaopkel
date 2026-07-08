import { X, AlertTriangle, Info, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export type ConfirmTone = "destructive" | "warning" | "success" | "info" | "primary";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  children?: ReactNode;
  tone?: ConfirmTone;
  loading?: boolean;
}

const TONE_CONFIG: Record<ConfirmTone, { 
    icon: any, 
    iconBg: string, 
    iconText: string, 
    btnBg: string, 
    btnText: string,
    btnHover: string 
}> = {
  destructive: {
    icon: AlertTriangle,
    iconBg: "bg-destructive/15",
    iconText: "text-destructive",
    btnBg: "bg-destructive shadow-[0_0_15px_-3px_rgba(239,68,68,0.4)]",
    btnText: "text-white",
    btnHover: "hover:bg-destructive/90"
  },
  warning: {
    icon: AlertCircle,
    iconBg: "bg-warning/15",
    iconText: "text-warning-foreground",
    btnBg: "bg-warning",
    btnText: "text-warning-foreground",
    btnHover: "hover:bg-warning/90"
  },
  success: {
    icon: CheckCircle2,
    iconBg: "bg-success/15",
    iconText: "text-success",
    btnBg: "bg-success",
    btnText: "text-white",
    btnHover: "hover:bg-success/90"
  },
  info: {
    icon: Info,
    iconBg: "bg-blue-500/15",
    iconText: "text-blue-500",
    btnBg: "bg-blue-500",
    btnText: "text-white",
    btnHover: "hover:bg-blue-600"
  },
  primary: {
    icon: Info,
    iconBg: "bg-primary-soft",
    iconText: "text-primary",
    btnBg: "bg-primary",
    btnText: "text-primary-foreground",
    btnHover: "hover:bg-primary-hover"
  }
};

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Tasdiqlash",
  cancelLabel = "Bekor qilish",
  confirmDisabled = false,
  children,
  tone = "primary",
  loading = false
}: Props) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isOpen]);

  if (!isOpen) return null;

  const config = TONE_CONFIG[tone];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm transition-opacity" 
        onClick={loading ? undefined : onClose} 
      />
      
      <div className="relative bg-card border border-border w-full max-w-sm rounded-[24px] shadow-[var(--shadow-lg)] overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex flex-col items-center text-center">
            <div className={`w-14 h-14 rounded-2xl ${config.iconBg} flex items-center justify-center ${config.iconText} mb-4`}>
              <Icon className="w-7 h-7" />
            </div>
            
            <h3 className="text-xl font-bold text-foreground mb-2">{title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
            {children}
          </div>
        </div>

        <div className="p-4 bg-secondary/30 grid grid-cols-2 gap-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            className={`w-full py-3 rounded-xl font-bold transition-all disabled:opacity-50 ${config.btnBg} ${config.btnText} ${config.btnHover}`}
          >
            {loading ? "Yuklanmoqda..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
