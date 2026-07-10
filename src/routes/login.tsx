import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useSession, saveSession } from "@/lib/store";
import { API, setToken } from "@/lib/api/client";
import { registerPushNotifications } from "@/lib/push-notification";
import { formatUzbekPhone } from "@/lib/utils";
import { Briefcase } from "lucide-react";
import { toast } from "sonner";
import logo from "../logo.png"

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "CRM tizimi — Kirish" },
      { name: "description", content: "CRM tizimiga kirish" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"director" | "employee">("director");

  useEffect(() => {
    if (session?.role === "director") navigate({ to: "/director" });
    else if (session?.role === "employee") navigate({ to: "/employee" });
  }, [session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { accessToken } = await API.login(phone, password);
      setToken(accessToken);
      const user = await API.me();
      
      const userRole = user.role.toLowerCase();
      if (userRole !== role) {
        throw new Error("Ruxsat berilmagan: Tanlangan rol mos kelmadi");
      }
      
      const fullName = `${user.firstName} ${user.lastName}`.trim();
      saveSession({ id: user.id || user.sub, role: userRole as "director" | "employee", name: fullName, login: user.phoneNumber });
      toast.success(`Xush kelibsiz, ${fullName}`);
      // Root layout'dagi effekt faqat to'liq sahifa yuklanganda ishga tushadi — SPA
      // navigatsiyasida qayta ishga tushmaydi, shuning uchun bu yerda ham chaqiramiz
      // (aks holda birinchi login'da push-bildirishnomalar ro'yxatdan o'tmay qoladi).
      registerPushNotifications().catch(() => {});

      if (userRole === "director") navigate({ to: "/director" });
      else navigate({ to: "/employee" });
    } catch (err: any) {
      toast.error(err.message || "Login yoki parol noto'g'ri");
      setToken(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--gradient-soft)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-[var(--shadow-lg)]">
          <div className="w-14 h-14 rounded-xl bg-[var(--gradient-primary)] flex items-center justify-center text-primary-foreground mb-5 mx-auto shadow-[var(--shadow-md)]">
            {/* <Briefcase className="w-7 h-7" /> */}
            <img className="w-12 h-12" src={logo} alt="Logo" />
          </div>
          <h1 className="text-2xl font-bold text-center text-foreground">
           Tourland CRM tizimiga xush kelibsiz
          </h1>
          <p className="text-center text-sm text-muted-foreground mt-1 mb-6">
            Rolingizni tanlang va tizimga kiring
          </p>

          <div className="flex gap-2 p-1 bg-secondary rounded-xl mb-6">
            <button
              onClick={() => setRole("director")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                role === "director" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Direktor
            </button>
            <button
              onClick={() => setRole("employee")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                role === "employee" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Hodim
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5 relative">
              <label 
                htmlFor="phone" 
                className="text-[13px] font-semibold text-foreground/80 pl-1 uppercase tracking-wider block"
              >
                Telefon raqam
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatUzbekPhone(e.target.value))}
                placeholder="+998 90 123 45 67"
                dir="ltr"
                required
                className="w-full px-4 py-3.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Parol</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold shadow-lg hover:bg-primary-hover transition-all"
            >
              Kirish
            </button>
            {role === "director" && (
              <div className="text-center pt-1">
                <a
                  href="/forgot-password"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate({ to: "/forgot-password" });
                  }}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Parolni unutdingizmi?
                </a>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
