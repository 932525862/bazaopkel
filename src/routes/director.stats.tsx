import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useAppState } from "@/lib/store";
import { BarChart3, Users, ShoppingCart, Wallet, Filter, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { API } from "@/lib/api/client";
import { toast } from "sonner";
import { getTashkentDayjs } from "@/lib/date-utils";

export const Route = createFileRoute("/director/stats")({
  component: DirectorStats,
});

function DirectorStats() {
  const { state, update } = useAppState();
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>(getTashkentDayjs().format("YYYY-MM"));
  const [salesPage, setSalesPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [clients, cats, employees] = await Promise.all([
          API.clients(),
          API.categories(),
          API.employees()
        ]);
        update(s => ({ ...s, clients, categories: cats, employees }));
      } catch {
        toast.error("Statistika ma'lumotlarini yuklashda xatolik");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const stats = useMemo(() => {
    const clients = state.clients.filter(c => {
      const dateStr = c.sale?.completedAt || c.sale?.soldAt || c.createdAt;
      if (!dateStr) return false;
      return getTashkentDayjs(dateStr).format("YYYY-MM") === monthFilter;
    });

    const filteredBaseClients = employeeFilter === "all" 
      ? clients 
      : clients.filter(c => c.sale?.completedByName === employeeFilter || c.call?.inCallByName === employeeFilter);

    const totalClients = filteredBaseClients.length;

    const soldClients = clients.filter((c) => 
      c.sale?.status === "full" && (employeeFilter === "all" || c.sale?.completedByName === employeeFilter)
    );
    const partialClients = clients.filter((c) => 
      c.sale?.status === "partial" && (employeeFilter === "all" || c.sale?.completedByName === employeeFilter)
    );
    
    const totalRevenue = clients.reduce((sum, c) => {
      if (employeeFilter !== "all" && c.sale?.completedByName !== employeeFilter) return sum;
      return sum + (c.sale?.payments?.reduce((s, p) => s + (p.amount || 0), 0) ?? 0)
    }, 0);

    const byEmployee = new Map<string, { name: string; count: number; revenue: number; fullAdditional: number; partialAdditional: number }>();
    for (const c of clients.filter(c => c.sale?.status === "full" || c.sale?.status === "partial")) {
      const name = c.sale?.completedByName ?? "Noma'lum";
      if (employeeFilter !== "all" && name !== employeeFilter) continue;
      
      const rev = c.sale?.payments?.reduce((s: number, p: any) => s + (p.amount || 0), 0) ?? 0;
      const additional = c.sale?.additionalPrice || 0;
      const cur = byEmployee.get(name) ?? { name, count: 0, revenue: 0, fullAdditional: 0, partialAdditional: 0 };
      if (c.sale?.status === "full") {
        cur.count += 1;
        cur.fullAdditional += additional;
      } else {
        cur.partialAdditional += additional;
      }
      cur.revenue += rev;
      byEmployee.set(name, cur);
    }

    const byCategory = state.categories.map((cat) => {
      const inCat = filteredBaseClients.filter((c) => c.categoryId === cat.id);
      const withSale = inCat.filter((c) => (c.sale?.status === "full" || c.sale?.status === "partial") && (employeeFilter === "all" || c.sale?.completedByName === employeeFilter));
      
      const revenue = withSale.reduce(
        (s: number, c: any) => s + (c.sale?.payments?.reduce((a: number, p: any) => a + (p.amount || 0), 0) ?? 0),
        0
      );
      const fullAdditional = withSale.filter((c: any) => c.sale?.status === "full").reduce((s: number, c: any) => s + (c.sale?.additionalPrice || 0), 0);
      const partialAdditional = withSale.filter((c: any) => c.sale?.status === "partial").reduce((s: number, c: any) => s + (c.sale?.additionalPrice || 0), 0);
      const soldCount = withSale.filter(c => c.sale?.status === "full").length;

      return {
        id: cat.id,
        name: cat.name,
        clients: inCat.length,
        sold: soldCount,
        revenue,
        fullAdditional,
        partialAdditional,
      };
    });

    const sales = (employeeFilter === "all" ? clients : clients.filter(c => c.sale?.completedByName === employeeFilter))
      .filter(c => c.sale?.status === "full" || c.sale?.status === "partial")
      .map((c) => ({
        id: c.id,
        name: c.data?.["Ism familya"] || c.name || "Mijoz",
        category: state.categories.find((cat) => cat.id === c.categoryId)?.name ?? "—",
        seller: c.sale?.completedByName ?? "—",
        amount: c.sale?.payments?.reduce((s, p) => s + (p.amount || 0), 0) ?? 0,
        date: c.sale?.completedAt ?? c.sale?.soldAt ?? c.createdAt,
      }))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));

    const fullAdditionalRevenue = clients.reduce((sum, c) => {
      if (c.sale?.status !== "full") return sum;
      if (employeeFilter !== "all" && c.sale?.completedByName !== employeeFilter) return sum;
      return sum + (c.sale?.additionalPrice || 0);
    }, 0);

    const partialAdditionalRevenue = clients.reduce((sum, c) => {
      if (c.sale?.status !== "partial") return sum;
      if (employeeFilter !== "all" && c.sale?.completedByName !== employeeFilter) return sum;
      return sum + (c.sale?.additionalPrice || 0);
    }, 0);

    const additionalRevenue = fullAdditionalRevenue + partialAdditionalRevenue;

    return {
      totalClients,
      soldCount: clients.filter(c => 
        (c.sale?.status === "full") && 
        (employeeFilter === "all" || c.sale?.completedByName === employeeFilter)
      ).length,
      partialCount: clients.filter(c => 
        (c.sale?.status === "partial") && 
        (employeeFilter === "all" || c.sale?.completedByName === employeeFilter)
      ).length,
      totalRevenue,
      additionalRevenue,
      fullAdditionalRevenue,
      partialAdditionalRevenue,
      byEmployee: Array.from(byEmployee.values()).sort((a, b) => (b.revenue + b.fullAdditional + b.partialAdditional) - (a.revenue + a.fullAdditional + a.partialAdditional)),
      byCategory,
      sales,
    };
  }, [state, employeeFilter, monthFilter]);

  const salesPageSize = 10;
  const salesPageCount = Math.max(1, Math.ceil(stats.sales.length / salesPageSize));
  const salesPageItems = stats.sales.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize);

  const handleSalesPageChange = (page: number) => {
    setSalesPage(Math.min(Math.max(page, 1), salesPageCount));
  };

  useEffect(() => {
    setSalesPage(1);
  }, [employeeFilter, stats.sales.length]);

  const fmt = (n: number) => n.toLocaleString("uz-UZ") + " so'm";

  if (loading) {
    return (
       <div className="p-10 text-center">
         <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
         <p className="text-muted-foreground animate-pulse font-medium">Yuklanmoqda...</p>
       </div>
    );
  }

  return (
    <div className="p-6 md:p-10">
      <header className="mb-10 flex items-start justify-between flex-wrap gap-6 text-balance">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
            <TrendingUp className="w-10 h-10 text-primary" /> Statistika
          </h1>
          <p className="text-muted-foreground mt-1.5 font-medium">Biznesingiz o'sish ko'rsatkichlari va tahlili</p>
        </div>
        <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-2.5 shadow-sm">
          <Filter className="w-5 h-5 text-primary" />
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="bg-transparent text-sm font-bold text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all">Barcha hodimlar</option>
            <option value={state.director.name}>{state.director.name} (direktor)</option>
            {state.employees.map((e) => (
              <option key={e.id} value={`${e.firstName} ${e.lastName}`}>
                {e.firstName} {e.lastName}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-10">
        <KpiCard icon={Users} label="Jami mijozlar" value={String(stats.totalClients)} tone="primary"  delta="+12%" />
        <KpiCard icon={ShoppingCart} label="Sotildi" value={String(stats.soldCount)} tone="success" delta="+5%" />
        <KpiCard icon={ShoppingCart} label="Nasiya sotuv" value={String(stats.partialCount)} tone="warning" delta="-2%" />
        <KpiCard 
          icon={ArrowUpRight} 
          label="Qo'shimcha daromad" 
          value={fmt(stats.additionalRevenue)} 
          tone="success" 
          delta="+15%" 
          subValue={`To'liq: ${stats.fullAdditionalRevenue.toLocaleString()} so'm`}
          subValue2={`Nasiya: ${stats.partialAdditionalRevenue.toLocaleString()} so'm`}
        />
        <KpiCard icon={Wallet} label="Umumiy tushum" value={fmt(stats.totalRevenue)} tone="info" delta="+18%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        {/* By category */}
        <section className="bg-card border border-border rounded-[32px] overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border bg-secondary/10 flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Bo'limlar bo'yicha tahlil</h2>
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                <tr>
                  <th className="text-left px-6 py-4">Bo'lim</th>
                  <th className="text-right px-6 py-4">Mijoz</th>
                  <th className="text-right px-6 py-4">Sotuv</th>
                  <th className="text-right px-6 py-4">Umumiy tushum</th>
                  <th className="text-right px-6 py-4">Qo'sh. (To'liq)</th>
                  <th className="text-right px-6 py-4">Qo'sh. (Nasiya)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {stats.byCategory.map((c) => (
                  <tr key={c.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 text-foreground font-bold">{c.name}</td>
                    <td className="px-6 py-4 text-right text-muted-foreground font-medium">{c.clients}</td>
                    <td className="px-6 py-4 text-right text-success font-black">{c.sold}</td>
                    <td className="px-6 py-4 text-right text-foreground font-bold">{fmt(c.revenue)}</td>
                    <td className="px-6 py-4 text-right text-success font-bold">{fmt(c.fullAdditional)}</td>
                    <td className="px-6 py-4 text-right text-warning font-bold">{fmt(c.partialAdditional)}</td>
                  </tr>
                ))}
                {stats.byCategory.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground italic">Ma'lumot yo'q</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* By employee */}
        <section className="bg-card border border-border rounded-[32px] overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border bg-secondary/10 flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Xodimlar natijadorligi</h2>
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                <tr>
                  <th className="text-left px-6 py-4">Xodim</th>
                  <th className="text-right px-6 py-4">Sotuvlar</th>
                  <th className="text-right px-6 py-4">Umumiy tushum</th>
                  <th className="text-right px-6 py-4">Qo'sh. (To'liq)</th>
                  <th className="text-right px-6 py-4">Qo'sh. (Nasiya)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {stats.byEmployee.map((e) => (
                  <tr key={e.name} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 text-foreground font-bold">{e.name}</td>
                    <td className="px-6 py-4 text-right text-primary font-black">{e.count}</td>
                    <td className="px-6 py-4 text-right text-foreground font-bold">{fmt(e.revenue)}</td>
                    <td className="px-6 py-4 text-right text-success font-bold">{fmt(e.fullAdditional)}</td>
                    <td className="px-6 py-4 text-right text-warning font-bold">{fmt(e.partialAdditional)}</td>
                  </tr>
                ))}
                {stats.byEmployee.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground italic">Hodimlar natijasi yo'q</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Sales list */}
      <section className="bg-card border border-border rounded-[32px] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-secondary/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">Oxirgi sotuvlar operatsiyalari</h2>
            {employeeFilter !== "all" && (
               <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">{employeeFilter}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-primary" />
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="bg-card border border-border rounded-xl px-3 py-1.5 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
              <tr>
                <th className="text-left px-6 py-4">Mijoz</th>
                <th className="text-left px-6 py-4">Bo'lim</th>
                <th className="text-left px-6 py-4">Xodim</th>
                <th className="text-right px-6 py-4">Summa</th>
                <th className="text-right px-6 py-4">Sana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
                {salesPageItems.map((s) => (
                <tr key={s.id} className="hover:bg-secondary/20 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="text-foreground font-bold group-hover:text-primary transition-colors">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">ID: {s.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground font-medium">{s.category}</td>
                  <td className="px-6 py-4 text-foreground font-medium">{s.seller}</td>
                  <td className="px-6 py-4 text-right text-success font-black">{fmt(s.amount)}</td>
                  <td className="px-6 py-4 text-right text-muted-foreground font-bold">
                    {getTashkentDayjs(s.date).format("DD.MM.YYYY")}
                  </td>
                </tr>
              ))}
              {stats.sales.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic">Operatsiyalar topilmadi</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {stats.sales.length > salesPageSize ? (
          <div className="border-t border-border bg-secondary/10 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {`Ko'rinayotgan ${Math.min((salesPage - 1) * salesPageSize + 1, stats.sales.length)}–${Math.min(salesPage * salesPageSize, stats.sales.length)} / ${stats.sales.length}`}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSalesPageChange(salesPage - 1)}
                disabled={salesPage === 1}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Oldingi
              </button>
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: salesPageCount }, (_, index) => {
                  const page = index + 1;
                  return (
                    <button
                      key={page}
                      onClick={() => handleSalesPageChange(page)}
                      className={`min-w-[36px] rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${page === salesPage ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-secondary"}`}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => handleSalesPageChange(salesPage + 1)}
                disabled={salesPage === salesPageCount}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Keyingi
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
  delta,
  subValue,
  subValue2
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "primary" | "success" | "warning" | "info";
  delta?: string;
  subValue?: string;
  subValue2?: string;
}) {
  const isUp = delta?.startsWith("+");
  const toneClass = {
    primary: "bg-primary-soft text-primary border-primary/10",
    success: "bg-success/15 text-success border-success/20",
    warning: "bg-warning/15 text-warning border-warning/20",
    info: "bg-blue-500/10 text-blue-500 border-blue-500/20"
  }[tone];

  return (
    <div className="bg-card border border-border rounded-[28px] p-6 shadow-sm hover:shadow-glow hover:border-primary/20 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center border transition-transform group-hover:scale-110 ${toneClass}`}>
          <Icon className="w-6 h-6" />
        </div>
        {delta && (
          <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${isUp ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
            {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {delta}
          </span>
        )}
      </div>
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">{label}</p>
      <p className="text-2xl font-black text-foreground tracking-tight">{value}</p>
      {subValue && (
        <p className="text-[10px] font-bold text-success mt-1 bg-success/10 px-2 py-0.5 rounded-md inline-block">
          {subValue}
        </p>
      )}
      {subValue2 && (
        <p className="text-[10px] font-bold text-warning mt-0.5 bg-warning/10 px-2 py-0.5 rounded-md inline-block">
          {subValue2}
        </p>
      )}
    </div>
  );
}

function Layers(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.83 6.18a2 2 0 0 0 0 3.64L11.17 13.82a2 2 0 0 0 1.66 0L21.17 9.82a2 2 0 0 0 0-3.64Z"/><path d="m3.42 12.62 4.18 1.86a2 2 0 0 0 1.66 0l2.74-1.21"/><path d="m3.42 16.62 4.18 1.86a2 2 0 0 0 1.66 0l2.74-1.21"/><path d="m14 11 7.17 3.18a2 2 0 0 1 0 3.64l-8.34 3.71a2 2 0 0 1-1.66 0L2.83 17.82a2 2 0 0 1 0-3.64Z"/></svg>
  );
}
