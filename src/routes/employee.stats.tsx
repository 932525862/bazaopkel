import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useSession } from "@/lib/store";
import { BarChart3, Users, ShoppingCart, Wallet, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, Filter } from "lucide-react";
import { API } from "@/lib/api/client";
import { toast } from "sonner";
import { getTashkentDayjs } from "@/lib/date-utils";

export const Route = createFileRoute("/employee/stats")({
  component: EmployeeStats,
});

function EmployeeStats() {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ clients: any[]; categories: any[] }>({ clients: [], categories: [] });
  const [salesPage, setSalesPage] = useState(1);
  const [salesFilter, setSalesFilter] = useState<"all" | "full" | "partial">("all");
  const [monthFilter, setMonthFilter] = useState<string>(getTashkentDayjs().format("YYYY-MM"));

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clients, cats] = await Promise.all([
          API.clients(),
          API.categories()
        ]);
        setData({ clients, categories: cats });
      } catch {
        toast.error("Statistika ma'lumotlarini yuklashda xatolik");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const myName = session?.name || "";
    const myClients = data.clients.filter((c: any) => {
      const isSeller = c.sale?.completedByName === myName || c.call?.inCallByName === myName;
      if (!isSeller) return false;
      
      const dateStr = c.sale?.completedAt || c.sale?.soldAt || c.createdAt;
      if (!dateStr) return false;
      return getTashkentDayjs(dateStr).format("YYYY-MM") === monthFilter;
    });
    
    const totalClientsCount = myClients.length;
    
    const soldClients = myClients.filter((c: any) => c.sale?.status === "full");
    const partialClients = myClients.filter((c: any) => c.sale?.status === "partial");

    const totalRevenue = myClients.reduce((sum: number, c: any) => {
      return sum + (c.sale?.payments?.reduce((s: number, p: any) => s + (p.amount || 0), 0) ?? 0);
    }, 0);

    const fullAdditionalRevenue = myClients.reduce((sum: number, c: any) => {
      if (c.sale?.status !== "full") return sum;
      return sum + (c.sale?.additionalPrice || 0);
    }, 0);

    const partialAdditionalRevenue = myClients.reduce((sum: number, c: any) => {
      if (c.sale?.status !== "partial") return sum;
      return sum + (c.sale?.additionalPrice || 0);
    }, 0);

    const additionalRevenue = fullAdditionalRevenue + partialAdditionalRevenue;

    const byCategory = data.categories.map((cat: any) => {
      const inCat = myClients.filter((c: any) => c.categoryId === cat.id);
      const withSale = inCat.filter((c: any) => c.sale?.status === "full" || c.sale?.status === "partial");
      
      const revenue = withSale.reduce(
        (s: number, c: any) => s + (c.sale?.payments?.reduce((a: number, p: any) => a + (p.amount || 0), 0) ?? 0),
        0
      );
      const fullAdditional = withSale.filter((c: any) => c.sale?.status === "full").reduce((s: number, c: any) => s + (c.sale?.additionalPrice || 0), 0);
      const partialAdditional = withSale.filter((c: any) => c.sale?.status === "partial").reduce((s: number, c: any) => s + (c.sale?.additionalPrice || 0), 0);
      const soldCount = withSale.filter((c: any) => c.sale?.status === "full").length;

      return {
        id: cat.id,
        name: cat.name,
        clients: inCat.length,
        sold: soldCount,
        revenue,
        fullAdditional,
        partialAdditional,
      };
    }).filter((c: any) => c.clients > 0 || c.sold > 0);

    const salesList = myClients
      .filter((c: any) => c.sale?.status === "full" || c.sale?.status === "partial")
      .map((c: any) => ({
        id: c.id,
        name: c.data?.["Ism familya"] || c.name || "Mijoz",
        category: data.categories.find((cat: any) => cat.id === c.categoryId)?.name ?? "—",
        amount: c.sale?.payments?.reduce((s: number, p: any) => s + (p.amount || 0), 0) ?? 0,
        date: c.sale?.completedAt || c.sale?.soldAt || c.createdAt,
        status: c.sale?.status
      }))
      .sort((a: any, b: any) => +new Date(b.date) - +new Date(a.date));

    return {
      totalClientsCount,
      soldCount: soldClients.length,
      partialCount: partialClients.length,
      totalRevenue,
      additionalRevenue,
      fullAdditionalRevenue,
      partialAdditionalRevenue,
      byCategory,
      salesList,
    };
  }, [data, session?.name, monthFilter]);

  const filteredSalesList = salesFilter === "all" ? stats.salesList : stats.salesList.filter((s: any) => s.status === salesFilter);
  const salesPageSize = 10;
  const salesPageCount = Math.max(1, Math.ceil(filteredSalesList.length / salesPageSize));
  const salesPageItems = filteredSalesList.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize);

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
      <header className="mb-10">
        <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
          <TrendingUp className="w-10 h-10 text-primary" /> Mening natijalarim
        </h1>
        <p className="text-muted-foreground mt-1.5 font-medium">Shaxsiy ish ko'rsatkichlaringiz va tahlili</p>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-10">
        <KpiCard icon={Users} label="Mijozlarim" value={String(stats.totalClientsCount)} tone="primary" />
        <KpiCard icon={ShoppingCart} label="Sotuvlarim" value={String(stats.soldCount)} tone="success" />
        <KpiCard icon={ShoppingCart} label="Nasiya sotuvlar" value={String(stats.partialCount)} tone="warning" />
        <KpiCard 
          icon={ArrowUpRight} 
          label="Qo'shimcha daromad" 
          value={fmt(stats.additionalRevenue)} 
          tone="success" 
          subValue={`To'liq: ${stats.fullAdditionalRevenue.toLocaleString()} so'm`}
          subValue2={`Nasiya: ${stats.partialAdditionalRevenue.toLocaleString()} so'm`}
        />
        <KpiCard icon={Wallet} label="Shaxsiy tushum" value={fmt(stats.totalRevenue)} tone="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        {/* By category */}
        <section className="bg-card border border-border rounded-[32px] overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border bg-secondary/10 flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Bo'limlar bo'yicha</h2>
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                <tr>
                  <th className="text-left px-6 py-4">Bo'lim</th>
                  <th className="text-right px-6 py-4">Mijoz</th>
                  <th className="text-right px-6 py-4">Sotuv</th>
                  <th className="text-right px-6 py-4">Tushum</th>
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
                    <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground italic">Hali sotuvlar yo'q</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent sales */}
        <section className="bg-card border border-border rounded-[32px] overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border bg-secondary/10 flex items-center justify-between gap-4 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">Oxirgi sotuvlarim</h2>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 mr-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    <input
                      type="month"
                      value={monthFilter}
                      onChange={(e) => setMonthFilter(e.target.value)}
                      className="bg-card border border-border rounded-xl px-2 py-1 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                    />
                  </div>
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <select
                    value={salesFilter}
                    onChange={(e) => { setSalesFilter(e.target.value as any); setSalesPage(1); }}
                    className="px-3 py-1.5 rounded-xl border border-border bg-card text-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                  >
                    <option value="all">Barchasi</option>
                    <option value="full">To'liq</option>
                    <option value="partial">Nasiya</option>
                  </select>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        <tr>
                            <th className="text-left px-6 py-4">Mijoz</th>
                            <th className="text-right px-6 py-4">Summa</th>
                            <th className="text-right px-6 py-4">Sana</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {salesPageItems.map((s) => (
                            <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="text-foreground font-bold">{s.name}</div>
                                    <div className="text-[10px] text-muted-foreground uppercase">{s.category}</div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="text-success font-black">{fmt(s.amount)}</div>
                                    <div className={`text-[10px] font-bold ${s.status === 'full' ? 'text-success' : 'text-warning'}`}>
                                        {s.status === 'full' ? 'To\'liq' : 'Nasiya'}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right text-muted-foreground font-medium">
                                    {getTashkentDayjs(s.date).format("DD.MM.YYYY")}
                                </td>
                            </tr>
                        ))}
                        {filteredSalesList.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-6 py-10 text-center text-muted-foreground italic">
                                    {salesFilter === "all" ? "Operatsiyalar yo'q" : salesFilter === "full" ? "To'liq sotuvlar yo'q" : "Nasiya sotuvlar yo'q"}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
      </div>
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
  icon: any;
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
