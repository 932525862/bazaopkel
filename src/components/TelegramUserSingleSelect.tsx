import { useState, useEffect } from "react";
import { Search, Check, Send, X } from "lucide-react";
import { API } from "@/lib/api/client";
import { toast } from "sonner";

interface TelegramUser {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
  tempFullName: string | null;
}

interface Props {
  onSelected: (id: string) => void;
  excludeIds?: string[];
}

export function TelegramUserSingleSelect({ onSelected, excludeIds = [] }: Props) {
  const [users, setUsers] = useState<TelegramUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const handleSelect = (user: TelegramUser) => {
    const isAttached = excludeIds.includes(user.telegramId);
    if (isAttached) return; // Cannot select attached users
    
    if (selectedId === user.telegramId) {
      setSelectedId(null);
      onSelected("");
    } else {
      setSelectedId(user.telegramId);
      onSelected(user.telegramId);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all font-bold text-sm ${
            isOpen || selectedId
              ? "bg-amber-500/10 border-amber-500/30 text-amber-600 shadow-sm" 
              : "bg-card border-border text-muted-foreground hover:border-amber-500/20"
          }`}
        >
          <Send className="w-5 h-5" />
          {selectedId ? "Xususiy xabar" : "Ogohlantirish"}
        </button>
        
        {selectedId && (
          <button
            onClick={() => {
              setSelectedId(null);
              onSelected("");
            }}
            className="p-3 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all shadow-sm group"
            title="Bekor qilish"
          >
            <X className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
        )}
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-[280px] bg-card border border-border rounded-[24px] shadow-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-3 border-b border-border bg-secondary/30">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-amber-500 transition-colors" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Qidirish..."
                  className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500/30 text-sm font-medium"
                />
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground animate-pulse font-medium text-sm">Yuklanmoqda...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-medium text-sm">Foydalanuvchilar topilmadi</div>
              ) : (
                  filtered.map(user => {
                    const fullName = user.tempFullName
                      || (`${user.firstName} ${user.lastName || ''}`.trim())
                      || '—';
                    const isAttached = excludeIds.includes(user.telegramId);
                    return (
                      <button
                        key={user.id}
                        onClick={() => handleSelect(user)}
                        disabled={isAttached}
                        className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left group ${
                          selectedId === user.telegramId
                            ? "bg-amber-500/10 text-amber-600"
                            : isAttached
                            ? "opacity-50 cursor-not-allowed bg-secondary/30"
                            : "hover:bg-secondary/80 text-foreground"
                        }`}
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className={`font-bold text-sm leading-tight text-foreground transition-colors truncate ${
                            isAttached ? "line-through text-muted-foreground" : "group-hover:text-amber-600"
                          }`}>
                            {fullName}
                          </span>
                          {user.phoneNumber && (
                            <span className={`text-[11px] font-medium ${isAttached ? "line-through text-muted-foreground/50" : "text-muted-foreground"}`}>
                              📞 +{user.phoneNumber}
                            </span>
                          )}
                          {isAttached && (
                            <span className="text-[9px] font-black uppercase text-destructive/70 tracking-tighter mt-0.5">
                              Biriktirilgan
                            </span>
                          )}
                        </div>
                        {selectedId === user.telegramId && (
                          <div className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                            <Check className="w-3 h-3 stroke-[4]" />
                          </div>
                        )}
                      </button>
                    );
                  })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
