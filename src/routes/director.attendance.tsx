import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useAppState } from "@/lib/store";
import { API, assetUrl } from "@/lib/api/client";
import { formatUzDate, formatUzMonth, formatUzDateTable, formatUzTime, getTashkentDayjs } from "@/lib/date-utils";
import { toast } from "sonner";
import type { AttendanceStatus } from "@/lib/types";
import {
  Calendar,
  Clock,
  User as UserIcon,
  ArrowLeft,
  LogIn,
  LogOut,
  Search,
  RefreshCw,
  X,
  CheckCircle,
  AlertCircle,
  Users,
  Filter,
  UserX,
} from "lucide-react";

export const Route = createFileRoute("/director/attendance")({
  component: DirectorAttendance,
});

function fmtTime(iso?: string | null) {
  return iso ? formatUzTime(iso) : "—";
}

function fmtDate(dateStr: string) {
  return formatUzDate(dateStr, { includeYear: true });
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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
    const hrs = hoursWorked(rec);
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-success/10 text-success text-xs font-bold border border-success/20">
        <CheckCircle className="w-3 h-3" /> {formatHumanDuration(hrs)} ISHLADI
      </span>
    );
  }

  if (isToday && (status === "PRESENT" || (!status && rec.checkInAt && !rec.checkOutAt))) {
    const hrsNum = rec.checkInAt
      ? getTashkentDayjs().diff(getTashkentDayjs(rec.checkInAt), "hour", true)
      : 0;
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/10 text-primary text-xs font-bold border border-primary/20 animate-pulse">
        <Clock className="w-3 h-3" /> {formatHumanDuration(hrsNum)} HOZIR ISHDA
      </span>
    );
  }

  // Fallback for past days with no checkout or explicitly marked PRESENT but it's not today anymore
  if (!isToday && rec.checkInAt && !rec.checkOutAt) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-warning/10 text-warning text-xs font-bold border border-warning/20">
        <AlertCircle className="w-3 h-3" /> YAKUNLANMAGAN
      </span>
    );
  }

  return null;
}

function DirectorAttendance() {
  const { state, update } = useAppState();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState(currentYM());
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [tick, setTick] = useState(0);

  // Live update ticker for active hours
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const list = await API.attendance();
      update((s) => ({ ...s, attendance: list }));

      // If current month is empty but there is data, select the latest month with data
      if (list.length > 0) {
        const ym = currentYM();
        const hasCurrentMonth = list.some(r => r.date.startsWith(ym));
        if (!hasCurrentMonth) {
          const latest = list.reduce((a, b) => a.date > b.date ? a : b);
          setMonthFilter(latest.date.substring(0, 7));
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Davomat ma'lumotlarini yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, [update]);

  const handleBackfill = async () => {
    setIsBackfilling(true);
    const toastId = toast.loading("O'tgan kunlar davomati tiklanmoqda (backfill)...");
    try {
      await API.backfillAttendance(30);
      toast.success("O'tgan kunlar davomati muvaffaqiyatli tiklandi", { id: toastId });
      fetchAttendance();
    } catch (err: any) {
      toast.error(err.message || "Backfill xatolik", { id: toastId });
    } finally {
      setIsBackfilling(false);
    }
  };

  useEffect(() => {
    fetchAttendance();

    const unsub = API.initSocket((ev) => {
      // "reconnected" — socket qayta ulanganda o'tkazib yuborilganlarni qoplash
      if (ev === "attendanceCheckedIn" || ev === "attendanceCheckedOut" || ev === "reconnected") {
        fetchAttendance();
      }
    });
    return () => unsub();
  }, [fetchAttendance]);

  // Group records by employee
  const recordsByEmp = useMemo(() => {
    const map: Record<string, typeof state.attendance> = {};
    for (const r of state.attendance ?? []) {
      (map[r.employeeId] ||= []).push(r);
    }
    return map;
  }, [state.attendance]);

  // Today's summary stats
  const today = todayStr();
  const todayRecs = useMemo(
    () => (state.attendance ?? []).filter((r) => r.date === today),
    [state.attendance, today]
  );
  const presentNow = todayRecs.filter((r) => r.status === "PRESENT" || (!r.status && r.checkInAt && !r.checkOutAt)).length;
  const attendedToday = todayRecs.filter((r) => r.status === "ATTENDED" || r.checkOutAt).length;
  const absentToday = todayRecs.filter((r) => r.status === "ABSENT").length;
  const neverCheckedIn = state.employees.filter(
    (e) => e.isActive && !todayRecs.find((r) => r.employeeId === e.id)
  ).length;

  // Filtered employees
  const filteredEmps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.employees.filter((e) => {
      if (!q) return true;
      return (
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        (e.phone || "").includes(q)
      );
    });
  }, [state.employees, search]);

  // ─── Detail view for one employee ───────────────────────────────────────────
  if (selected) {
    const emp = state.employees.find((e) => e.id === selected);
    // Warning for duplicate names
    const duplicates = state.employees.filter(e => 
      e.id !== selected && 
      e.firstName === emp?.firstName && 
      e.lastName === emp?.lastName
    );

    const allRecs = (recordsByEmp[selected] ?? [])
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
    const monthRecs = allRecs.filter((r) => r.date.startsWith(monthFilter));
    const monthTotal = monthRecs.reduce((s, r) => s + hoursWorked(r), 0);
    const activeRec = allRecs.find((r) => r.date === today && (r.status === "PRESENT" || (!r.status && !r.checkOutAt && r.checkInAt)));

    const presentDays = monthRecs.filter((r) => r.status !== "ABSENT").length;
    const absentDays = monthRecs.filter((r) => r.status === "ABSENT").length;

    return (
      <div className="p-6 md:p-10 max-w-6xl">
        {/* Header */}
        <button
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Orqaga
        </button>

        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black ${activeRec ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
              {emp ? emp.firstName[0] : "?"}
            </div>
            <div>
              <h1 className="text-3xl font-black text-foreground">
                {emp ? `${emp.firstName} ${emp.lastName}` : "Hodim"}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-muted-foreground text-sm">{emp?.phone}</p>
                {activeRec && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest animate-pulse">
                    Hozir ishlayapti
                  </span>
                )}
              </div>
            </div>
          </div>

          {duplicates.length > 0 && (
            <div className="w-full mt-4 p-4 rounded-2xl bg-warning/10 border border-warning/20 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-warning shrink-0" />
              <div className="text-sm text-warning-foreground">
                <p className="font-bold">E'tibor bering!</p>
                <p>Ushbu ismli yana {duplicates.length} ta hodim mavjud. Davomat ma'lumotlari boshqa hisobda ham bo'lishi mumkin.</p>
                <div className="mt-1 flex gap-2 flex-wrap">
                  {duplicates.map(d => (
                    <button 
                      key={d.id} 
                      onClick={() => setSelected(d.id)}
                      className="px-2 py-0.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-[10px] font-bold uppercase transition-colors"
                    >
                      Boshqasini ko'rish ({d.phone})
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Month filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Bu oy jami soat",
              value: formatHumanDuration(monthTotal),
              unit: "",
              color: "text-primary",
              bg: "bg-primary/5",
            },
            {
              label: "Kelgan kunlar",
              value: presentDays,
              unit: "kun",
              color: "text-success",
              bg: "bg-success/5",
            },
            {
              label: "Kelmagan kunlar",
              value: absentDays,
              unit: "kun",
              color: "text-destructive",
              bg: "bg-destructive/5",
            },
            {
              label: "O'rtacha soat",
              value: presentDays ? formatHumanDuration(monthTotal / presentDays) : "0m",
              unit: "",
              color: "text-foreground",
              bg: "bg-secondary/50",
            },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-2xl border border-border p-5`}>
              <p className="text-xs text-muted-foreground font-medium mb-2">{s.label}</p>
              <p className={`text-2xl font-black ${s.color}`}>
                {s.value}
                <span className="text-sm font-medium text-muted-foreground ml-1">{s.unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Records table */}
        <div className="bg-card rounded-[28px] border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-secondary/20 flex items-center justify-between">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              {monthFilter
                ? formatUzMonth(monthFilter)
                : "Barcha yozuvlar"}
            </h2>
            <span className="text-xs text-muted-foreground">{monthRecs.length} ta yozuv</span>
          </div>

          {monthRecs.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 rounded-[20px] bg-secondary/50 flex items-center justify-center mx-auto mb-4 text-muted-foreground/40">
                <Calendar className="w-8 h-8" />
              </div>
              <p className="text-muted-foreground font-medium">Bu oy uchun yozuvlar yo'q</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/30 text-muted-foreground text-[10px] uppercase font-black tracking-widest border-b border-border">
                  <tr>
                    <th className="text-left px-5 py-4">Sana</th>
                    <th className="text-left px-5 py-4">Keldi</th>
                    <th className="text-left px-5 py-4">Ketdi</th>
                    <th className="text-center px-5 py-4">Suratlar</th>
                    <th className="text-right px-5 py-4">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {monthRecs.map((r) => {
                    const isAbsent = r.status === "ABSENT";
                    return (
                        <tr
                          key={r.id}
                          className={`transition-colors ${
                            isAbsent 
                              ? "bg-destructive/3 hover:bg-destructive/5" 
                              : r.isAutoCheckout
                              ? "bg-destructive/5 hover:bg-destructive/10 border-2 border-destructive/50"
                              : "hover:bg-secondary/20"
                          }`}
                        >
                        <td className="px-5 py-4">
                          <div className="font-bold text-foreground">{formatUzDateTable(r.date).main}</div>
                          <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">
                            {formatUzDateTable(r.date).sub}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {r.checkInAt ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-success/10 text-success text-xs font-bold border border-success/10">
                              <LogIn className="w-3 h-3" /> {fmtTime(r.checkInAt)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {r.checkOutAt ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-destructive/10 text-destructive text-xs font-bold border border-destructive/10">
                              <LogOut className="w-3 h-3" /> {fmtTime(r.checkOutAt)}
                            </span>
                          ) : isAbsent ? (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/10 text-primary text-xs font-bold animate-pulse border border-primary/20 w-fit">
                                Hozir ishlayapti
                              </span>
                              {r.checkInAt && (
                                <span className="text-[10px] text-muted-foreground font-black ml-1">
                                  {formatHumanDuration(getTashkentDayjs().diff(getTashkentDayjs(r.checkInAt), "hour", true))} ishladi
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-4">
                            {r.photo && (
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">Kelish</span>
                                <button
                                  onClick={() => setSelectedPhoto(r.photo!)}
                                  className="w-10 h-10 rounded-lg overflow-hidden border border-border hover:scale-110 transition-transform shadow-sm"
                                  title="Kelish surati"
                                >
                                  <img src={assetUrl(r.photo!)} alt="In" className="w-full h-full object-cover" />
                                </button>
                              </div>
                            )}
                            {r.checkOutPhoto && (
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">Ketish</span>
                                <button
                                  onClick={() => setSelectedPhoto(r.checkOutPhoto!)}
                                  className="w-10 h-10 rounded-lg overflow-hidden border border-border hover:scale-110 transition-transform shadow-sm"
                                  title="Ketish surati"
                                >
                                  <img src={assetUrl(r.checkOutPhoto!)} alt="Out" className="w-full h-full object-cover" />
                                </button>
                              </div>
                            )}
                            {!r.photo && !r.checkOutPhoto && (
                              <span className="text-muted-foreground/40 text-xs">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <StatusBadge status={r.status} rec={r} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Photo preview modal */}
        {selectedPhoto && (
          <div
            className="fixed inset-0 z-[100] bg-foreground/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setSelectedPhoto(null)}
          >
            <div
              className="relative max-w-lg w-full aspect-square rounded-[32px] overflow-hidden border-4 border-white/20 shadow-2xl animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <img src={assetUrl(selectedPhoto)} className="w-full h-full object-cover" alt="Preview" />
              <button
                onClick={() => setSelectedPhoto(null)}
                className="absolute top-4 right-4 p-2.5 rounded-2xl bg-black/40 text-white backdrop-blur-md hover:bg-black/60 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Main list view ─────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-10 max-w-6xl">
      {/* Header */}
      <header className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-foreground flex items-center gap-3">
            <Clock className="w-8 h-8 text-primary" /> Davomat
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">
            {formatUzDate(new Date(), { includeYear: true, includeWeekday: true })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAttendance}
            disabled={loading}
            className="p-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-all disabled:opacity-50"
            title="Yangilash"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Today's stats */}
      <div className="grid sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">HOZIR ISHDAGI</p>
            <p className="text-2xl font-black text-primary">{presentNow}</p>
          </div>
        </div>
        <div className="bg-success/5 border border-success/10 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center text-success">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">ISHLADI</p>
            <p className="text-2xl font-black text-success">{attendedToday}</p>
          </div>
        </div>
        <div className="bg-destructive/5 border border-destructive/10 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
            <UserX className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">KELMAGAN</p>
            <p className="text-2xl font-black text-destructive">{absentToday}</p>
          </div>
        </div>
        <div className="bg-secondary/50 border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Qayd etilmagan</p>
            <p className="text-2xl font-black text-foreground">{neverCheckedIn}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Hodim qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 rounded-2xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Employee cards */}
      {loading && state.attendance.length === 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-secondary" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-secondary rounded w-3/4" />
                  <div className="h-3 bg-secondary rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-secondary rounded" />
                <div className="h-3 bg-secondary rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredEmps.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">
            {state.employees.length === 0 ? "Hodimlar yo'q" : "Hodimlar topilmadi"}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmps.map((emp) => {
            const recs = recordsByEmp[emp.id] ?? [];
            const ym = currentYM();
            const monthRecs = recs.filter((r) => r.date.startsWith(ym));
            const monthTotal = monthRecs.reduce((s, r) => s + hoursWorked(r), 0);
            const todayRec = recs.find((r) => r.date === today);
            const isPresent = todayRec?.status === "PRESENT" || (!todayRec?.status && todayRec?.checkInAt && !todayRec?.checkOutAt);
            const isAttended = todayRec?.status === "ATTENDED" || (todayRec?.checkOutAt != null);
            const isAbsent = todayRec?.status === "ABSENT";
            const lastRec = recs
              .filter((r) => r.status !== "ABSENT")
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))[0];

            return (
              <button
                key={emp.id}
                onClick={() => setSelected(emp.id)}
                className={`text-left bg-card rounded-2xl border p-5 hover:shadow-md transition-all group ${
                  isAbsent
                    ? "border-destructive/20 hover:border-destructive/40"
                    : isPresent
                    ? "border-primary/20 hover:border-primary/40"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black transition-transform group-hover:scale-110 ${
                      isAbsent
                        ? "bg-destructive/10 text-destructive"
                        : isPresent
                        ? "bg-primary/15 text-primary"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {emp.firstName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground truncate">
                      {emp.firstName} {emp.lastName}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {isPresent ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-primary uppercase tracking-widest">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          HOZIR ISHDA
                        </span>
                      ) : isAttended ? (
                        <span className="text-[10px] font-black text-success uppercase tracking-widest">
                          ✓ ISHLADI
                        </span>
                      ) : isAbsent ? (
                        <span className="text-[10px] font-black text-destructive uppercase tracking-widest">
                          ✗ KELMAGAN
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          {emp.isActive ? "Qayd etilmagan" : "Faolsiz"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Bu oy soat</span>
                    <span className="font-black text-foreground">{formatHumanDuration(monthTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Bu oy kelgan</span>
                    <span className="font-bold text-foreground">
                      {monthRecs.filter((r) => r.status !== "ABSENT").length} kun
                    </span>
                  </div>
                  {lastRec && (
                    <div className="flex justify-between items-center pt-1 border-t border-border/50">
                      <span className="text-muted-foreground text-xs">Oxirgi</span>
                      <span className="text-xs text-muted-foreground">
                        {lastRec.date} · {fmtTime(lastRec.checkInAt)}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
