import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAppState, updateDirector } from "@/lib/store";
import { API } from "@/lib/api/client";
import { formatUzbekPhone } from "@/lib/utils";
import { toast } from "sonner";
import { User, Save } from "lucide-react";

export const Route = createFileRoute("/director/")({
  component: DirectorProfile,
});

function DirectorProfile() {
  const { state, update } = useAppState();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Fetch actual profile from backend API on mount
  useEffect(() => {
    API.me().then((user) => {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setPhone(user.phoneNumber || "");
    }).catch(() => {
      // Fallback to store if API fails
      if (state.director.name) {
        const parts = state.director.name.split(" ");
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
      }
      setPhone(state.director.login || "");
    });
  }, []);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      toast.error("Barcha maydonlarni to'ldiring");
      return;
    }
    try {
      await API.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phone.trim(),
      });
      update((s) =>
        updateDirector(s, {
          name: `${firstName.trim()} ${lastName.trim()}`,
          login: phone.trim(),
        }),
      );
      toast.success("Profil ma'lumotlari yangilandi");
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      toast.error("Parollarni kiriting");
      return;
    }
    try {
      await API.changePassword({ oldPassword, newPassword });
      toast.success("Parol muvaffaqiyatli o'zgartirildi");
      setOldPassword("");
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message || "Eski parol noto'g'ri");
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Profil</h1>
        <p className="text-muted-foreground mt-1">Ushbu bo‘lim orqali ma’lumotlaringizni tahrirlashingiz mumkin.</p>
      </header>

      <div className="space-y-6">
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8 shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-border">
            <div className="w-16 h-16 rounded-2xl bg-[var(--gradient-primary)] flex items-center justify-center text-primary-foreground shadow-[var(--shadow-md)]">
              <User className="w-8 h-8 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">{state.director.name}</h2>
              <p className="text-sm text-muted-foreground">Direktor</p>
            </div>
          </div>

          <form onSubmit={handleProfileSave} className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Ism</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Familya</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Telefon raqam
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(formatUzbekPhone(e.target.value))}
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg hover:shadow-primary/30 transition-all active:scale-[0.98]"
            >
              <Save className="w-5 h-5" /> Ma'lumotlarni saqlash
            </button>
          </form>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 md:p-8 shadow-[var(--shadow-sm)]">
          <h3 className="text-lg font-semibold mb-6">Parolni o'zgartirish</h3>
          <form onSubmit={handleChangePassword} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Eski parol</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Yangi parol
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-secondary text-foreground font-bold border border-border/50 hover:bg-foreground hover:text-background transition-all active:scale-[0.98]"
            >
              Parolni yangilash
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
