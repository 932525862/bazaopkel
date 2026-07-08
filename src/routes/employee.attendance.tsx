import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useAppState, useSession } from "@/lib/store";
import { CameraCheckInDialog } from "@/components/CameraCheckInDialog";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { AttendanceStatus } from "@/lib/types";
import {
  Calendar,
  Clock,
  LogIn,
  LogOut,
  Coffee,
  Timer,
  User,
  X,
  RefreshCw,
  Filter,
  CheckCircle,
  UserX,
  AlertCircle,
} from "lucide-react";
import { API, assetUrl } from "@/lib/api/client";
import { formatUzDate, formatUzDateTable, formatUzTime, getTashkentDayjs } from "@/lib/date-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/employee/attendance")({
  component: EmployeeAttendance,
});

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtTime(iso?: string | null) {
  return iso ? formatUzTime(iso) : "—";
}

function hoursWorked(rec: { checkInAt?: string | null; checkOutAt?: string | null }) {
  if (!rec.checkInAt || !rec.checkOutAt) return 0;
  const ci = getTashkentDayjs(rec.checkInAt);
  const co = getTashkentDayjs(rec.checkOutAt);
  return Math.max(0, co.diff(ci, "hour", true));
}

function formatHumanDuration(hours: number) {
  if (hours <= 0) return "0m";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}d`;
  return `${h}s ${m}d`;
}

function StatusBadge({ status, rec }: { status?: AttendanceStatus; rec: { date: string; checkInAt?: string | null; checkOutAt?: string | null } }) {
  const isToday = rec.date === todayStr();

  if (status === "ABSENT") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-destructive/10 text-destructive text-xs font-bold border border-destructive/20">
        <UserX className="w-3 h-3" /> KELMAGAN
      </span>
    );
  }
  
  if (status === "ATTENDED" || (!isToday && rec.checkOutAt)) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-success/10 text-success text-xs font-bold border border-success/20">
        <CheckCircle className="w-3 h-3" /> ISHLADI
      </span>
    );
  }
  
  if (isToday && (status === "PRESENT" || (!status && rec.checkInAt && !rec.checkOutAt))) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/10 text-primary text-xs font-bold border border-primary/20 animate-pulse">
        <Clock className="w-3 h-3" /> HOZIR ISHDA
      </span>
    );
  }

  // Fail-safe for past days with no check-out
  if (!isToday && rec.checkInAt && !rec.checkOutAt) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-warning/10 text-warning text-xs font-bold border border-warning/20">
        <AlertCircle className="w-3 h-3" /> YAKUNLANMAGAN
      </span>
    );
  }

  return null;
}

function useLiveElapsed(startIso?: string | null) {
  const [ms, setMs] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!startIso) {
      setMs(0);
      if (ref.current) clearInterval(ref.current);
      return;
    }
    const tick = () =>
      setMs(getTashkentDayjs().diff(getTashkentDayjs(startIso)));
    tick();
    ref.current = setInterval(tick, 30_000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [startIso]);

  return ms;
}

function EmployeeAttendance() {
  const { state, update } = useAppState();
  const session = useSession();
  const [openIn, setOpenIn] = useState(false);
  const [openOut, setOpenOut] = useState(false);
  const [openConfirmOut, setOpenConfirmOut] = useState(false);
  const [confirmChallenge, setConfirmChallenge] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState(currentYM());

  const [tick, setTick] = useState(0);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const list = await API.myAttendance();
      update((s) => ({ ...s, attendance: list }));
    } catch {
      toast.error("Davomat ma'lumotlarini yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, [session]);

  const myRecords = useMemo(
    () =>
      (state.attendance ?? []).sort(
        (a, b) => +new Date(b.date) - +new Date(a.date)
      ),
    [state.attendance]
  );

  const today = todayStr();
  const activeRec = myRecords.find(
    (r) => r.date === today && (r.status === "PRESENT" || (!r.status && r.checkInAt && !r.checkOutAt))
  );
  const finishedToday = myRecords.some(
    (r) => r.date === today && (r.status === "ATTENDED" || r.checkOutAt)
  );
  const canCheckIn = !activeRec && !finishedToday;

  // Live elapsed time
  const elapsedMs = useLiveElapsed(activeRec?.checkInAt);
  const elapsedHrs = elapsedMs / 3600000;
  const elapsedFmt = formatHumanDuration(elapsedHrs);

  // Month totals (only non-absent days)
  const monthTotal = useMemo(() => {
    let total = myRecords
      .filter((r) => r.date.startsWith(monthFilter) && r.status !== "ABSENT")
      .reduce((s, r) => s + hoursWorked(r), 0);

    if (activeRec && activeRec.date.startsWith(monthFilter)) {
      total += elapsedMs / 3600000;
    }
    return total;
  }, [myRecords, monthFilter, activeRec, elapsedMs]);

  const monthDays = useMemo(
    () => myRecords.filter((r) => r.date.startsWith(monthFilter) && r.status !== "ABSENT").length,
    [myRecords, monthFilter]
  );

  const absentDays = useMemo(
    () => myRecords.filter((r) => r.date.startsWith(monthFilter) && r.status === "ABSENT").length,
    [myRecords, monthFilter]
  );

  const filteredRecords = useMemo(
    () => myRecords.filter((r) => r.date.startsWith(monthFilter)),
    [myRecords, monthFilter]
  );

  const handleCheckIn = async (photo: string) => {
    try {
      await API.checkIn(photo);
      toast.success("Xush kelibsiz! Ish kuni boshlandi.");
      await fetchAttendance();
      setOpenIn(false);
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    }
  };

  const handleCheckOut = async (photo: string) => {
    try {
      await API.checkOut(activeRec?.id || "", photo);
      toast.success("Ish kuni yakunlandi. Charchamang!");
      await fetchAttendance();
      setOpenOut(false);
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    }
  };

  return (
    <div className="p-6 md:p-10">
      {/* Header */}
      <header className="mb-10 flex items-start justify-between flex-wrap gap-6">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
            <Clock className="w-10 h-10 text-primary" /> Davomat
          </h1>
          <p className="text-muted-foreground mt-1.5 font-medium">
            {formatUzDate(new Date(), { includeYear: true, includeWeekday: true })}
          </p>
          {session?.isActive === false && (
             <div className="mt-4 p-4 rounded-2xl bg-destructive/5 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                Sizning hisobingiz vaqtincha faolsizlantirilgan. Iltimos, direktor bilan bog'laning.
             </div>
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={fetchAttendance}
            title="Yangilash"
            className="p-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
          >
            <RefreshCw className={`w-6 h-6 ${loading ? "animate-spin" : ""}`} />
          </button>
          <>
            {canCheckIn && (
              <button
                onClick={() => setOpenIn(true)}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-success text-success-foreground font-black shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <LogIn className="w-5 h-5" />
                Ishga keldim
              </button>
            )}

            {activeRec && (
              <button
                onClick={() => {
                  setConfirmChallenge("");
                  setOpenConfirmOut(true);
                }}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-destructive text-destructive-foreground font-black shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <LogOut className="w-5 h-5" /> Ishdan ketdim
              </button>
            )}

            {finishedToday && (
              <button
                disabled
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-success text-success-foreground font-black shadow-lg opacity-50"
              >
                <LogIn className="w-5 h-5" />
                Ishga kelindi ✓
              </button>
            )}
          </>
        </div>
      </header>

      {/* Live status banner when clocked in */}
      {activeRec && (
        <div className="mb-8 p-5 rounded-[28px] bg-primary/5 border border-primary/20 flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
            <Timer className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-black text-primary text-lg">
              {elapsedFmt} ishlandi
            </p>
            <p className="text-muted-foreground text-sm">
              Kirish: {fmtTime(activeRec.checkInAt)} · Ish jarayonida...
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-black text-primary uppercase tracking-widest">HOZIR ISHDA</span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <div className="bg-card border border-border rounded-[28px] p-6 shadow-sm group hover:border-primary/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-[18px] bg-primary-soft text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
              <Timer className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              Bugun ishlanyapti
            </p>
          </div>
          <p className="text-3xl font-black text-foreground">
            {activeRec
              ? elapsedFmt
              : finishedToday
              ? formatHumanDuration(myRecords
                  .filter((r) => r.date === today)
                  .reduce((s, r) => s + hoursWorked(r), 0))
              : "0m"}
          </p>
        </div>

        <div className="bg-card border border-border rounded-[28px] p-6 shadow-sm group hover:border-success/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-[18px] bg-success/15 text-success flex items-center justify-center group-hover:scale-110 transition-transform">
              <Coffee className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              Oy jami
            </p>
          </div>
          <p className="text-3xl font-black text-foreground">
            {formatHumanDuration(monthTotal)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{monthDays} ish kuni</p>
        </div>

        <div className="bg-card border border-border rounded-[28px] p-6 shadow-sm group hover:border-success/20 transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-[18px] bg-success/10 text-success flex items-center justify-center group-hover:scale-110 transition-transform">
              <CheckCircle className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              Kelgan kunlar
            </p>
          </div>
          <p className="text-3xl font-black text-foreground">
            {monthDays}
            <span className="text-sm font-bold text-muted-foreground ml-1">kun</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">bu oy</p>
        </div>
      </div>

      {/* History section */}
      <section className="bg-card border border-border rounded-[32px] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-secondary/10 flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" /> Tarixiy qaydlar
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-bold text-success uppercase tracking-widest">
                Tizim faol
              </span>
            </div>
            <div className="flex items-center gap-2 relative">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring lowercase"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest border-b border-border">
              <tr>
                <th className="text-left px-6 py-5">Sana</th>
                <th className="text-left px-6 py-5">Kelish</th>
                <th className="text-left px-6 py-5">Ketish</th>
                <th className="text-center px-6 py-5">Surat</th>
                <th className="text-center px-6 py-5">Holat</th>
                <th className="text-right px-6 py-5">Ish vaqti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredRecords.map((r) => {
                const isAbsent = r.status === "ABSENT";
                return (
                  <tr
                    key={r.id}
                    className={`transition-all group ${isAbsent ? "bg-destructive/3 hover:bg-destructive/5" : "hover:bg-secondary/20"}`}
                  >
                    <td className="px-6 py-5">
                      <div className={`text-foreground font-bold ${isAbsent ? "text-muted-foreground" : ""}`}>
                        {formatUzDateTable(r.date).main}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase font-black tracking-tighter">
                        {formatUzDateTable(r.date).sub}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {r.checkInAt ? (
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-success/10 text-success text-xs font-bold border border-success/10">
                          <LogIn className="w-3.5 h-3.5" /> {fmtTime(r.checkInAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      {r.checkOutAt ? (
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-destructive/10 text-destructive text-xs font-bold border border-destructive/10">
                          <LogOut className="w-3.5 h-3.5" /> {fmtTime(r.checkOutAt)}
                        </span>
                      ) : isAbsent ? (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold animate-pulse border border-primary/20">
                          Ish jarayonida...
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="flex items-center justify-center gap-4">
                        {r.photo && (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">Kelish</span>
                            <button
                              onClick={() => setSelectedPhoto(r.photo!)}
                              className="w-10 h-10 rounded-lg overflow-hidden border border-border shadow-sm hover:scale-110 transition-transform bg-muted"
                            >
                              <img
                                src={assetUrl(r.photo!)}
                                alt="In"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          </div>
                        )}
                        {r.checkOutPhoto && (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">Ketish</span>
                            <button
                              onClick={() => setSelectedPhoto(r.checkOutPhoto!)}
                              className="w-10 h-10 rounded-lg overflow-hidden border border-border shadow-sm hover:scale-110 transition-transform bg-muted"
                            >
                              <img
                                src={assetUrl(r.checkOutPhoto!)}
                                alt="Out"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          </div>
                        )}
                        {!r.photo && !r.checkOutPhoto && (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <StatusBadge status={r.status} rec={r} />
                    </td>
                    <td className="px-6 py-5 text-right">
                      {isAbsent ? (
                        <span className="text-muted-foreground/40 text-sm">—</span>
                      ) : (
                        <>
                          <div className="text-foreground font-black text-lg">
                            {r.status === "PRESENT" && r.checkInAt
                              ? formatHumanDuration(getTashkentDayjs().diff(getTashkentDayjs(r.checkInAt), "hour", true))
                              : formatHumanDuration(hoursWorked(r))}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredRecords.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-24 text-center">
                    <div className="w-20 h-20 bg-secondary/50 rounded-[28px] flex items-center justify-center mx-auto mb-4 text-muted-foreground/30">
                      <Calendar className="w-10 h-10" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-1">
                      Qaydlar topilmadi
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Bu oy uchun davomat tarixingiz mavjud emas.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Photo Preview Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-foreground/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-2xl w-full aspect-square sm:aspect-video rounded-[32px] overflow-hidden border-4 border-white/20 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={assetUrl(selectedPhoto)}
              className="w-full h-full object-cover"
              alt="Preview"
            />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 p-2.5 rounded-2xl bg-black/40 text-white backdrop-blur-md hover:bg-black/60 transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      <CameraCheckInDialog
        open={openIn}
        onOpenChange={setOpenIn}
        onConfirm={handleCheckIn}
        title="Ishga kelishni tasdiqlash"
        description="Ish boshlaganingizni qayd etish uchun suratga tushing."
        confirmLabel="Ishni boshlash"
      />
      <CameraCheckInDialog
        open={openOut}
        onOpenChange={setOpenOut}
        onConfirm={handleCheckOut}
        title="Ishdan ketishni tasdiqlash"
        description="Ish kuningizni yakunlash uchun suratga tushing."
        confirmLabel="Ishni yakunlash"
      />
      <ConfirmModal
        isOpen={openConfirmOut}
        onClose={() => {
          setOpenConfirmOut(false);
          setConfirmChallenge("");
        }}
        onConfirm={() => {
          setOpenConfirmOut(false);
          setConfirmChallenge("");
          setOpenOut(true);
        }}
        title="Ish vaqtini yakunlash"
        description="Siz haqiqatan ham ish vaqtini yakunlamoqchimisiz?"
        confirmLabel="Ha"
        cancelLabel="Yo'q"
        tone="destructive"
        confirmDisabled={confirmChallenge.trim() !== "56"}
      >
        <div className="mt-4 w-full text-left rounded-3xl border border-border/70 bg-secondary/40 p-4">
          <div className="text-sm font-medium text-foreground mb-3">
            Quyidagi misolni yeching va javobni kiriting:
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-xl font-black text-foreground">7 × 8 =</span>
            <input
              type="text"
              value={confirmChallenge}
              onChange={(e) => setConfirmChallenge(e.target.value)}
              className="w-full sm:max-w-40 rounded-2xl border border-border bg-card px-4 py-3 text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Javob"
            />
          </div>
          {confirmChallenge.length > 0 && confirmChallenge.trim() !== "56" ? (
            <p className="mt-3 text-sm text-destructive">
              Javob noto'g'ri, iltimos to'g'ri kiriting.
            </p>
          ) : null}
        </div>
      </ConfirmModal>
    </div>
  );
}
