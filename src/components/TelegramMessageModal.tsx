import { useState } from "react";
import { Send, X, ExternalLink, MessageSquareText } from "lucide-react";
import { API } from "@/lib/api/client";
import { toast } from "sonner";

interface Props {
  selectedTelegramIds: string[];
  clientId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function TelegramMessageModal({ selectedTelegramIds, clientId, onClose, onSuccess }: Props) {
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("Xabar matnini kiriting");
      return;
    }

    setSending(true);
    try {
      if (clientId && selectedTelegramIds.length === 1) {
        await API.telegramClientMessage({
          clientId,
          telegramId: selectedTelegramIds[0],
          description,
          link: link.trim() || undefined,
        });
      } else {
        await API.telegramBroadcast({
          telegramIds: selectedTelegramIds,
          description,
          link: link.trim() || undefined,
        });
      }
      toast.success("Xabarlar muvaffaqiyatli yuborildi");
      onSuccess();
    } catch (err) {
      toast.error("Xabar yuborishda xatolik");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
      <div 
        className="w-full max-w-[500px] bg-card border border-border rounded-[40px] shadow-2xl shadow-primary/5 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-8 border-b border-border bg-secondary/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[20px] bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <MessageSquareText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-foreground tracking-tight">Xabar yuborish</h2>
              <p className="text-muted-foreground text-sm font-medium">{selectedTelegramIds.length} ta foydalanuvchiga</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-2xl hover:bg-secondary text-muted-foreground transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="space-y-3">
            <label className="text-sm font-black uppercase tracking-widest text-muted-foreground ml-1">Xabar matni</label>
            <textarea
              required
              autoFocus
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Xabar mazmunini yozing..."
              className="w-full p-5 rounded-[24px] border border-border bg-secondary/30 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/30 transition-all font-medium min-h-[160px] resize-none text-lg"
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
              Havola (ixtiyoriy) <ExternalLink className="w-4 h-4 text-muted-foreground/50" />
            </label>
            <input
              type="url"
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-5 py-4 rounded-[18px] border border-border bg-secondary/30 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/30 transition-all font-medium text-foreground"
            />
          </div>

          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 rounded-[22px] border border-border text-foreground font-bold hover:bg-secondary transition-all"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex-[2] py-4 rounded-[22px] bg-primary text-primary-foreground font-black shadow-lg shadow-primary/20 hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 transition-all flex items-center justify-center gap-3"
            >
              {sending ? (
                "Yuborilmoqda..."
              ) : (
                <>
                  Xabar yuborish <Send className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
