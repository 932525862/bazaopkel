import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { API } from "@/lib/api/client";
import { formatUzbekPhone } from "@/lib/utils";
import { KeyRound, ArrowLeft, Phone, ShieldCheck, Lock, Eye, EyeOff, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Parolni tiklash — CRM" },
      { name: "description", content: "Parolni pincode orqali tiklash" },
    ],
  }),
  component: ForgotPasswordPage,
});

type Step = "phone" | "pincode" | "newpass" | "success";

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [pincode, setPincode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleVerifyPincode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !pincode.trim()) {
      toast.error("Barcha maydonlarni to'ldiring");
      return;
    }
    if (pincode.length < 4 || pincode.length > 6) {
      toast.error("Pincode 4–6 raqamdan iborat bo'lishi kerak");
      return;
    }
    setLoading(true);
    try {
      const res = await API.verifyPincode(phone, pincode);
      if (res.valid) {
        setStep("newpass");
        toast.success("Pincode tasdiqlandi!");
      } else {
        toast.error("Pincode noto'g'ri");
      }
    } catch (err: any) {
      toast.error(err.message || "Pincode tekshirishda xatolik");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim() || !confirmPassword.trim()) {
      toast.error("Barcha maydonlarni to'ldiring");
      return;
    }
    if (newPassword.length < 4) {
      toast.error("Parol kamida 4 ta belgidan iborat bo'lishi kerak");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Parollar mos kelmadi");
      return;
    }
    setLoading(true);
    try {
      await API.resetPassword(phone, pincode, newPassword);
      setStep("success");
      toast.success("Parol muvaffaqiyatli o'zgartirildi!");
    } catch (err: any) {
      toast.error(err.message || "Parolni o'zgartirishda xatolik");
    } finally {
      setLoading(false);
    }
  };

  const stepIndex = step === "phone" ? 0 : step === "pincode" ? 1 : step === "newpass" ? 2 : 3;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--gradient-soft)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-[var(--shadow-lg)]">
          {/* Header icon */}
          <div className="w-14 h-14 rounded-xl bg-[var(--gradient-primary)] flex items-center justify-center text-primary-foreground mb-5 mx-auto shadow-[var(--shadow-md)]">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-center text-foreground">
            Parolni tiklash
          </h1>
          <p className="text-center text-sm text-muted-foreground mt-1 mb-6">
            {step === "phone" && "Telefon raqamingizni kiriting"}
            {step === "pincode" && "Direktor tomonidan belgilangan pinkodni kiriting"}
            {step === "newpass" && "Yangi parolni kiriting"}
            {step === "success" && "Parol muvaffaqiyatli o'zgartirildi"}
          </p>

          {/* Progress indicator */}
          {step !== "success" && (
            <div className="flex items-center gap-2 mb-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
                    i <= stepIndex
                      ? "bg-primary shadow-[0_0_8px_var(--primary)]"
                      : "bg-secondary"
                  }`}
                />
              ))}
            </div>
          )}

          {/* Step: Phone */}
          {step === "phone" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!phone.trim()) {
                  toast.error("Telefon raqamni kiriting");
                  return;
                }
                setStep("pincode");
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  <Phone className="w-4 h-4 inline mr-1.5 -mt-0.5 text-primary" />
                  Telefon raqam
                </label>
                <input
                  type="text"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(formatUzbekPhone(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                  placeholder="+998 90 123 45 67"
                  dir="ltr"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold shadow-lg hover:bg-primary-hover transition-all"
              >
                Davom etish
              </button>
            </form>
          )}

          {/* Step: Pincode */}
          {step === "pincode" && (
            <form onSubmit={handleVerifyPincode} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  <ShieldCheck className="w-4 h-4 inline mr-1.5 -mt-0.5 text-primary" />
                  Pincode
                </label>
                <input
                  type="text"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-center tracking-[0.5em] text-2xl font-mono"
                  placeholder="• • • •"
                  required
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Direktor tomonidan belgilangan 4–6 raqamli pincode
                </p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold shadow-lg hover:bg-primary-hover transition-all disabled:opacity-50"
              >
                {loading ? "Tekshirilmoqda..." : "Tasdiqlash"}
              </button>
              <button
                type="button"
                onClick={() => setStep("phone")}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4 inline mr-1 -mt-0.5" /> Orqaga
              </button>
            </form>
          )}

          {/* Step: New Password */}
          {step === "newpass" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  <Lock className="w-4 h-4 inline mr-1.5 -mt-0.5 text-primary" />
                  Yangi parol
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    autoFocus
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-12 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  <Lock className="w-4 h-4 inline mr-1.5 -mt-0.5 text-primary" />
                  Parolni tasdiqlash
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-12 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold shadow-lg hover:bg-primary-hover transition-all disabled:opacity-50"
              >
                {loading ? "Saqlanmoqda..." : "Parolni o'zgartirish"}
              </button>
              <button
                type="button"
                onClick={() => setStep("pincode")}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4 inline mr-1 -mt-0.5" /> Orqaga
              </button>
            </form>
          )}

          {/* Step: Success */}
          {step === "success" && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <p className="text-foreground font-medium">
                Parolingiz muvaffaqiyatli o'zgartirildi!
              </p>
              <p className="text-sm text-muted-foreground">
                Endi yangi parol bilan tizimga kirishingiz mumkin.
              </p>
              <button
                onClick={() => navigate({ to: "/login" })}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold shadow-lg hover:bg-primary-hover transition-all"
              >
                Kirish sahifasiga qaytish
              </button>
            </div>
          )}

          {/* Back to login link */}
          {step !== "success" && (
            <div className="mt-6 text-center">
              <button
                onClick={() => navigate({ to: "/login" })}
                className="text-sm text-primary hover:underline font-medium"
              >
                Kirish sahifasiga qaytish
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
