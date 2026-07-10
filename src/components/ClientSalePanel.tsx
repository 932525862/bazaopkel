import { useState } from "react";
import { ShoppingCart, Bell, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Client, SaleInfo } from "@/lib/types";
import { API } from "@/lib/api/client";
import { useSession } from "@/lib/store";
import { ConfirmModal } from "@/components/ConfirmModal";
import { TelegramUserSingleSelect } from "@/components/TelegramUserSingleSelect";
import { TelegramMessageModal } from "@/components/TelegramMessageModal";
import { formatUzDate, getTashkentDayjs } from "@/lib/date-utils";

/**
 * ClientSalePanel — «Mijozlar» bo'limidagi TO'LIQ FUNKSIONAL sotuv/to'lov bloki.
 * ClientDetailDialog dan aynan ko'chirilgan: To'liq to'lov / Bo'lib to'lash,
 * qo'shimcha summa, keyingi to'lov sanasi, Telegram ogohlantirish, to'lovlar
 * tarixi, yangi to'lov, to'lovni yakunlash, to'lovni o'chirish.
 *
 * Bir joyda ishlatiladi — Mijozlar kartasi va omborning ID bo'yicha chiqim
 * qismida. Sotuv mijoz kartasiga (backend) yoziladi → statistikaga tushadi.
 */
interface Props {
  client: Client;
  onRefresh: () => void | Promise<void>;
  readOnly?: boolean;
  /** Telegram tanlashda chiqarib tashlanadigan id'lar (ixtiyoriy) */
  attachedTelegramIds?: string[];
}

export function ClientSalePanel({ client, onRefresh, readOnly = false, attachedTelegramIds = [] }: Props) {
  const session = useSession();
  const viewerRole: "director" | "employee" = session?.role === "director" ? "director" : "employee";

  const sale: SaleInfo = client.sale ?? { status: "none", payments: [] };
  const totalPaid = sale.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = sale.totalAmount ? Math.max(0, sale.totalAmount - totalPaid) : 0;

  const [loading, setLoading] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);
  const [purchaseMode, setPurchaseMode] = useState<"choose" | "full" | "partial">("choose");
  const [fullBase, setFullBase] = useState("");
  const [fullAdditional, setFullAdditional] = useState("");
  const [partialBase, setPartialBase] = useState("");
  const [partialAdditional, setPartialAdditional] = useState("");
  const [partialPaid, setPartialPaid] = useState("");
  const [partialNextDate, setPartialNextDate] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [leaseWarningTelegramId, setLeaseWarningTelegramId] = useState<string | null>(null);
  const [showFullPaymentConfirm, setShowFullPaymentConfirm] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [singleTelegramId, setSingleTelegramId] = useState<string | null>(null);
  const [showTelegramModal, setShowTelegramModal] = useState(false);

  const formatPrice = (val: string) => {
    if (!val) return "";
    return val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };
  const parsePrice = (val: string) => val.replace(/\D/g, "");

  const refresh = async () => { await onRefresh(); };

  const handleFullPurchase = async () => {
    const baseAmt = parseFloat(fullBase || "0");
    const addAmt = parseFloat(fullAdditional || "0");
    const total = baseAmt + addAmt;
    if (total <= 0) { toast.error("To'lov summasini kiriting"); return; }
    setLoading(true);
    try {
      await API.setSale(client.id, { status: "full", totalAmount: total, paidAmount: total, additionalPrice: addAmt });
      await API.updateClient(client.id, { stage: "sold" });
      toast.success("Sotildi (to'liq)");
      setShowPurchase(false);
      setFullBase(""); setFullAdditional("");
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally { setLoading(false); }
  };

  const handlePartialPurchase = async () => {
    const baseAmt = parseFloat(partialBase || "0");
    const addAmt = parseFloat(partialAdditional || "0");
    const total = baseAmt + addAmt;
    const paid = parseFloat(partialPaid || "0");
    if (total <= 0 || paid <= 0) { toast.error("To'liq summa va to'langan summani kiriting"); return; }
    if (paid >= total) { toast.error("To'langan summa to'liq summadan kichik bo'lishi kerak"); return; }
    if (!partialNextDate) { toast.error("Keyingi to'lov sanasini kiriting"); return; }
    if (!leaseWarningTelegramId) { toast.error("Ogohlantirish yuborish uchun telegram foydalanuvchisini tanlang"); return; }
    setLoading(true);
    try {
      await API.setSale(client.id, {
        status: "partial",
        totalAmount: total,
        paidAmount: paid,
        additionalPrice: addAmt,
        nextPaymentAt: new Date(partialNextDate).toISOString(),
        telegramId: leaseWarningTelegramId,
      });
      await API.updateClient(client.id, { stage: "sold" });
      toast.success("Sotildi (bir qismi)");
      setShowPurchase(false);
      setPartialBase(""); setPartialAdditional(""); setPartialPaid(""); setPartialNextDate("");
      setLeaseWarningTelegramId(null);
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally { setLoading(false); }
  };

  const handleAddPayment = async () => {
    const amt = parseFloat(extraAmount);
    if (!amt || amt <= 0) { toast.error("Summa kiriting"); return; }
    setLoading(true);
    try {
      await API.addPayment(client.id, amt);
      setExtraAmount("");
      toast.success("To'lov qo'shildi");
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally { setLoading(false); }
  };

  const handleDeletePayment = async () => {
    if (!paymentToDelete) return;
    setLoading(true);
    try {
      await API.deletePayment(paymentToDelete);
      toast.success("To'lov o'chirildi");
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
      setPaymentToDelete(null);
    }
  };

  const handleCompletePayment = async () => {
    setLoading(true);
    try {
      if (remaining > 0) await API.addPayment(client.id, remaining);
      await API.setSale(client.id, { status: "full" });
      toast.success("To'lov yakunlandi");
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally { setLoading(false); }
  };

  const sessionActive = session?.isActive !== false;

  return (
    <>
      <section className="rounded-xl border border-border p-4 space-y-3 bg-card" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" /> Sotuv
        </h3>

        {sale.status === "none" && !showPurchase && (
          <button
            onClick={() => setShowPurchase(true)}
            disabled={!sessionActive || readOnly}
            className="w-full py-2.5 rounded-lg bg-success text-white font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sotuvni rasmiylashtirish
          </button>
        )}

        {sale.status === "none" && showPurchase && purchaseMode === "choose" && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPurchaseMode("full")} className="py-3 rounded-lg bg-success text-success-foreground font-medium">
              To'liq to'lov
            </button>
            <button onClick={() => setPurchaseMode("partial")} className="py-3 rounded-lg bg-warning text-warning-foreground font-medium">
              Bo'lib to'lash
            </button>
            <button
              onClick={() => { setShowPurchase(false); setPurchaseMode("choose"); }}
              className="col-span-2 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Bekor qilish
            </button>
          </div>
        )}

        {sale.status === "none" && purchaseMode === "full" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">To'lov summasi</label>
                <input type="text" inputMode="numeric" value={formatPrice(fullBase)} onChange={(e) => setFullBase(parsePrice(e.target.value))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Qo'shimcha summa</label>
                <input type="text" inputMode="numeric" value={formatPrice(fullAdditional)} onChange={(e) => setFullAdditional(parsePrice(e.target.value))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Umumiy summa (jami)</label>
              <input type="text" readOnly value={formatPrice(((parseFloat(fullBase || "0") + parseFloat(fullAdditional || "0")) || "").toString())} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-transparent bg-secondary/50 text-foreground font-bold cursor-not-allowed text-sm" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleFullPurchase} disabled={loading} className="flex-1 py-2 rounded-lg bg-success text-white text-sm font-medium">Tasdiqlash</button>
              <button onClick={() => setPurchaseMode("choose")} className="px-3 py-2 rounded-lg border border-border text-sm">Orqaga</button>
            </div>
          </div>
        )}

        {sale.status === "none" && purchaseMode === "partial" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">To'lov summasi</label>
                <input type="text" inputMode="numeric" value={formatPrice(partialBase)} onChange={(e) => setPartialBase(parsePrice(e.target.value))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Qo'shimcha summa</label>
                <input type="text" inputMode="numeric" value={formatPrice(partialAdditional)} onChange={(e) => setPartialAdditional(parsePrice(e.target.value))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Umumiy summa</label>
                <input type="text" readOnly value={formatPrice(((parseFloat(partialBase || "0") + parseFloat(partialAdditional || "0")) || "").toString())} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-transparent bg-secondary/50 text-foreground font-bold cursor-not-allowed text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To'langan summa</label>
                <input type="text" inputMode="numeric" value={formatPrice(partialPaid)} onChange={(e) => setPartialPaid(parsePrice(e.target.value))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Keyingi to'lov sanasi</label>
              <input type="datetime-local" value={partialNextDate} onChange={(e) => setPartialNextDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-700 mb-0.5">Telegram ogohlantirish <span className="text-destructive">*</span></p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {leaseWarningTelegramId ? "✓ Foydalanuvchi tanlandi" : "Tasdiqlashdan oldin tanlash shart"}
                </p>
              </div>
              <TelegramUserSingleSelect onSelected={(id) => setLeaseWarningTelegramId(id || null)} excludeIds={attachedTelegramIds} />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={handlePartialPurchase} disabled={loading || !leaseWarningTelegramId} className="flex-1 py-2 rounded-lg bg-warning text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Tasdiqlash</button>
              <button onClick={() => setPurchaseMode("choose")} className="px-3 py-2 rounded-lg border border-border text-sm">Orqaga</button>
            </div>
          </div>
        )}

        {/* Payment summary + history */}
        {(sale.status !== "none" || sale.payments.length > 0) && (
          <div className="space-y-2">
            {sale.status !== "none" && (
              <div className="grid grid-cols-3 gap-2 text-sm bg-secondary/40 rounded-lg p-3 text-center">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Jami</div>
                  <div className="font-bold text-foreground">{sale.totalAmount?.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">To'langan</div>
                  <div className="font-bold text-success">{totalPaid.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Qoldiq</div>
                  <div className="font-bold text-destructive">{(remaining > 0 ? remaining : 0).toLocaleString()}</div>
                </div>
              </div>
            )}

            {sale.status === "partial" && remaining > 0 && sale.nextPaymentAt && (
              <div className="flex items-center justify-between text-xs bg-warning/10 text-warning-foreground rounded-lg p-3 border border-warning/20">
                <div className="flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5" />
                  <span>To'lov sanasi: {formatUzDate(sale.nextPaymentAt)}</span>
                </div>
                <div className="font-bold animate-pulse">
                  {Math.max(0, Math.ceil((getTashkentDayjs(sale.nextPaymentAt).valueOf() - getTashkentDayjs().valueOf()) / (1000 * 60 * 60 * 24)))} kun qoldi
                </div>
              </div>
            )}

            {sale.payments.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">To'lovlar tarixi</h4>
                <div className="space-y-1.5">
                  {sale.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs bg-secondary/30 rounded-lg p-2 group/pay">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{formatUzDate(p.createdAt)}</span>
                        <span className="font-bold text-foreground">{p.amount.toLocaleString()}</span>
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-1 opacity-0 group-hover/pay:opacity-100 transition-opacity">
                          <button onClick={() => { setSingleTelegramId(null); setShowTelegramModal(true); }} className="p-1 hover:bg-primary/10 text-primary rounded">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          {viewerRole === "director" && (
                            <button onClick={() => setPaymentToDelete(p.id)} className="p-1 hover:bg-destructive/10 text-destructive rounded">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sale.status === "partial" && (
              <div className="space-y-2 border-t border-border pt-3">
                <label className="text-[11px] font-bold text-muted-foreground uppercase">Yangi to'lov</label>
                {!readOnly && sessionActive ? (
                  <>
                    <div className="flex gap-2 max-w-full">
                      <input type="text" inputMode="numeric" value={formatPrice(extraAmount)} onChange={(e) => setExtraAmount(parsePrice(e.target.value))} placeholder="0" className="flex-1 px-3 py-2.5 rounded-lg border border-input bg-background text-sm" />
                      <button onClick={handleAddPayment} disabled={loading} className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold whitespace-nowrap">To'lov qo'shish</button>
                    </div>
                    <button onClick={() => setShowFullPaymentConfirm(true)} className="w-full py-2 rounded-lg bg-success/15 text-success text-xs font-bold hover:bg-success/20 transition-colors">To'lovni yakunlash</button>
                  </>
                ) : (
                  <p className="text-[10px] text-destructive font-bold italic">
                    {readOnly ? "Ko'rish rejimida to'lov qo'shish mumkin emas" : "To'lovni qo'shish uchun hisob faol bo'lishi kerak"}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={showFullPaymentConfirm}
        onClose={() => setShowFullPaymentConfirm(false)}
        onConfirm={() => { handleCompletePayment(); setShowFullPaymentConfirm(false); }}
        title="To'lovni yakunlash"
        description={`Mijoz barcha qolgan summani (${remaining.toLocaleString()} so'm) to'laganini va sotuvni muvaffaqiyatli yakunlashni tasdiqlaysizmi?`}
        confirmLabel="Tasdiqlash"
        tone="success"
        loading={loading}
      />

      <ConfirmModal
        isOpen={!!paymentToDelete}
        onClose={() => setPaymentToDelete(null)}
        onConfirm={handleDeletePayment}
        title="To'lovni o'chirish"
        description="Ushbu to'lovni o'chirishni tasdiqlaysizmi? Bu harakat sotuv balansiga ta'sir qiladi."
        confirmLabel="O'chirish"
        tone="destructive"
        loading={loading}
      />

      {showTelegramModal && (
        <TelegramMessageModal
          selectedTelegramIds={singleTelegramId ? [singleTelegramId] : []}
          clientId={client.id}
          onClose={() => { setShowTelegramModal(false); setSingleTelegramId(null); }}
          onSuccess={() => { setShowTelegramModal(false); setSingleTelegramId(null); }}
        />
      )}
    </>
  );
}
