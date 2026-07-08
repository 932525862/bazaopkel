import { useState, useEffect } from "react";
import { Send, Search, Check, X, Users } from "lucide-react";
import { API } from "@/lib/api/client";
import { toast } from "sonner";

interface TelegramUser {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
}

interface Props {
  onSelected: (ids: string[]) => void;
  onSendMessage: () => void;
}

export function TelegramUserSelect({ onSelected, onSendMessage }: Props) {
  const [users, setUsers] = useState<TelegramUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      API.telegramUsers()
        .then(setUsers)
        .catch(() => toast.error("Telegram foydalanuvchilarini yuklashda xatolik"))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const filtered = users.filter(u => 
    `${u.firstName} ${u.lastName || ""} ${u.username || ""} ${u.phoneNumber || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const toggleSelect = (telegramId: string) => {
    const newSelected = selected.includes(telegramId)
      ? selected.filter(id => id !== telegramId)
      : [...selected, telegramId];
    setSelected(newSelected);
    onSelected(newSelected);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all font-bold text-sm ${
            isOpen || selected.length > 0 
              ? "bg-primary/10 border-primary/30 text-primary shadow-sm" 
              : "bg-card border-border text-muted-foreground hover:border-primary/20"
          }`}
        >
          <Users className="w-5 h-5" />
          {selected.length > 0 ? `${selected.length} ta tanlandi` : "Telegram bot foydalanuvchilari"}
        </button>

        {selected.length > 0 && (
          <button
            onClick={onSendMessage}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white font-black shadow-lg hover:shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Send className="w-4 h-4" /> Xabar yuborish
          </button>
        )}
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-[320px] bg-card border border-border rounded-[24px] shadow-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-4 border-b border-border bg-secondary/30">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Qidirish..."
                  className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/30 text-sm font-medium"
                />
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground animate-pulse font-medium text-sm">Yuklanmoqda...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-medium text-sm">Foydalanuvchilar topilmadi</div>
              ) : (
                filtered.map(user => (
                  <button
                    key={user.id}
                    onClick={() => toggleSelect(user.telegramId)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left group ${
                      selected.includes(user.telegramId)
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-secondary/80 text-foreground"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-sm leading-tight text-foreground group-hover:text-primary transition-colors">
                        {user.firstName} {user.lastName}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {user.username ? `@${user.username}` : user.phoneNumber || "Raqamsiz"}
                      </span>
                    </div>
                    {selected.includes(user.telegramId) && (
                      <div className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[4]" />
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>

            {selected.length > 0 && (
              <div className="p-3 bg-secondary/30 border-t border-border flex justify-between items-center bg-card">
                <span className="text-xs font-bold text-muted-foreground px-1">{selected.length} ta tanlandi</span>
                <button
                  onClick={() => setSelected([])}
                  className="text-xs font-bold text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <X className="w-3 h-3" /> Tozalash
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
