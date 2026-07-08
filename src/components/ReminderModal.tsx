import { Bell } from "lucide-react";
import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reminderTime: string) => void;
  loading?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export function ReminderModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  loading,
  title = "Qayta qo'ng'iroq qilish",
  description = "Keyingi safar qachon bog'lanish kerak?",
  confirmLabel = "Saqlash va yakunlash"
}: Props) {
  const [callReminder, setCallReminder] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-[24px] border border-border shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
            <Bell className="w-6 h-6 text-amber-500" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          
          <div className="space-y-1.5">
            <input
              type="datetime-local"
              value={callReminder}
              onChange={(e) => setCallReminder(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500/30 transition-all"
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => onConfirm(callReminder)}
              disabled={!callReminder || loading}
              className="w-full py-3 bg-amber-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all disabled:opacity-50"
            >
              {confirmLabel}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Bekor qilish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
