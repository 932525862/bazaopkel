import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, ChevronDown, Truck, Search, Package, MapPin, ArrowRight, RefreshCw,
  Building2, IdCard, Camera, Clock, Boxes, Layers, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { getInTransitCargo, type TransitCargo, type TransitData } from "@/lib/warehouse-transit";
import { DamagedCargoPanel } from "@/components/DamagedCargoPanel";

interface Props {
  onClose: () => void;
}

const STATUS_FILTERS = [
  { key: "all", label: "Barchasi" },
  { key: "transit", label: "To'liq yo'lda" },
  { key: "partial", label: "Qisman qabul" },
] as const;

const NO_DEST_KEY = "__none__";

interface DestGroup {
  destId: string;
  destName: string;
  items: TransitCargo[];
}

interface VehicleGroup {
  vehicleNumber: string;
  items: TransitCargo[];
}

// Yuklarni FURA RAQAMI bo'yicha jamlaydi — bitta furada 20-30 ta yuk bo'lsa ham
// bitta yig'iladigan (dropdown) blok bo'lib ko'rinadi, ro'yxat cho'zilib ketmaydi.
function groupByVehicle(items: TransitCargo[]): VehicleGroup[] {
  const map = new Map<string, TransitCargo[]>();
  for (const c of items) {
    const vn = c.vehicleNumber || "—";
    if (!map.has(vn)) map.set(vn, []);
    map.get(vn)!.push(c);
  }
  return Array.from(map.entries()).map(([vehicleNumber, items]) => ({ vehicleNumber, items }));
}

interface ClientGroup {
  clientCode: string;
  clientName: string;
  items: TransitCargo[];
}

// Fura ichidagi yuklarni MIJOZ (ID) bo'yicha jamlaydi — bir odamda 20-30 ta yuk
// bo'lsa ham bitta yig'iladigan (dropdown) qatorga jamlanadi.
function groupByClient(items: TransitCargo[]): ClientGroup[] {
  const map = new Map<string, ClientGroup>();
  for (const c of items) {
    const key = (c.clientCode || c.clientName || "—").trim();
    if (!map.has(key)) map.set(key, { clientCode: c.clientCode, clientName: c.clientName, items: [] });
    map.get(key)!.items.push(c);
  }
  return Array.from(map.values());
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function InTransitCargoPanel({ onClose }: Props) {
  const [data, setData] = useState<TransitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [destId, setDestId] = useState<string>("all");
  // Qabul qilinmagan yuklar bo'limi (alohida to'liq ekran)
  const [showDamaged, setShowDamaged] = useState(false);

  // Manzil bo'yicha guruhlar — sig'ib ketmasligi uchun standart holatda yig'ilgan
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setExpandedGroups(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });

  // Har bir furaning to'liq tafsiloti — standart holatda yig'ilgan, bosilganda ochiladi
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toggleCard = (id: string) =>
    setExpandedCards(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // Fura raqami bo'yicha jamlangan bloklar — standart holatda yig'ilgan (dropdown)
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const toggleVehicle = (key: string) =>
    setExpandedVehicles(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });

  const load = async () => {
    setLoading(true);
    try {
      setData(await getInTransitCargo());
    } catch (err: any) {
      toast.error(err?.message || "Yo'ldagi yuklarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cargos = data?.cargos ?? [];

  // Manzil ombor bo'yicha filtr uchun — yo'ldagi yuklarda uchraydigan omborlar
  const destOptions = useMemo(() => {
    const map = new Map<string, string>();
    cargos.forEach(c => { if (c.destWarehouseId) map.set(c.destWarehouseId, c.destWarehouseName || "Ombor"); });
    return Array.from(map.entries());
  }, [cargos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cargos.filter(c => {
      if (status !== "all" && c.status !== status) return false;
      if (destId !== "all" && c.destWarehouseId !== destId) return false;
      if (!q) return true;
      return (
        c.vehicleNumber.toLowerCase().includes(q) ||
        c.clientCode.toLowerCase().includes(q) ||
        (c.clientName || "").toLowerCase().includes(q) ||
        c.sourceWarehouseName.toLowerCase().includes(q) ||
        (c.destWarehouseName || "").toLowerCase().includes(q) ||
        c.products.some(p => p.name.toLowerCase().includes(q))
      );
    });
  }, [cargos, query, status, destId]);

  const filteredTotals = useMemo(() => {
    // Yaxlitlash faqat OXIRIDA bir marta — har qadamda yaxlitlash yuzlab
    // furada xatoni to'playdi (warehouse-transit.ts bilan bir xil yondashuv).
    const raw = filtered.reduce(
      (a, c) => ({
        trucks: a.trucks + 1,
        soni: a.soni + c.inTransitTotals.soni,
        joys: a.joys + c.inTransitTotals.joys,
        brutto: a.brutto + c.inTransitTotals.brutto,
        vol: a.vol + c.inTransitTotals.vol,
      }),
      { trucks: 0, soni: 0, joys: 0, brutto: 0, vol: 0 },
    );
    return {
      trucks: raw.trucks,
      soni: raw.soni,
      joys: Math.round(raw.joys * 100) / 100,
      brutto: Math.round(raw.brutto * 100) / 100,
      vol: Math.round(raw.vol * 1000) / 1000,
    };
  }, [filtered]);

  // Manzil ombor bo'yicha guruhlash — 200-300 ta fura bo'lsa ham tartibli ko'rinishi uchun.
  // Eng ko'p furasi bor manzil tepada.
  const groups: DestGroup[] = useMemo(() => {
    const map = new Map<string, DestGroup>();
    for (const c of filtered) {
      const key = c.destWarehouseId || NO_DEST_KEY;
      const name = c.destWarehouseName || "Manzil ko'rsatilmagan";
      if (!map.has(key)) map.set(key, { destId: key, destName: name, items: [] });
      map.get(key)!.items.push(c);
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [filtered]);

  // Qidiruv yozilganda guruhlash chalg'itmasligi uchun tekis (flat) ro'yxat ko'rsatiladi
  const isSearching = query.trim().length > 0;

  const allGroupsExpanded = groups.length > 0 && groups.every(g => expandedGroups.has(g.destId));
  const toggleAllGroups = () => {
    setExpandedGroups(allGroupsExpanded ? new Set() : new Set(groups.map(g => g.destId)));
  };

  const fmtDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("uz-UZ", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[#F5F6FA] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#DDE1EA] bg-white shrink-0">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-11 h-11 rounded-2xl bg-violet-600/10 flex items-center justify-center shrink-0">
          <Truck className="w-6 h-6 text-violet-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black text-foreground truncate">Yo'ldagi yuklar</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Omborlararo harakatlanayotgan — hali to'liq qabul qilinmagan yuklar
          </p>
        </div>
        <button
          onClick={() => setShowDamaged(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-sm font-black text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="w-4 h-4" /> Qabul qilinmagan yuklar
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-bold text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Yangilash
        </button>
      </div>

      {/* Qabul qilinmagan yuklar bo'limi */}
      {showDamaged && <DamagedCargoPanel onClose={() => setShowDamaged(false)} />}

      {/* Totals bar */}
      <div className="shrink-0 px-5 py-3 bg-white border-b border-[#EEF0F5]">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { label: "Yo'ldagi furalar", val: filteredTotals.trucks, icon: Truck, accent: "text-violet-600" },
            { label: "Soni (dona)", val: filteredTotals.soni, icon: Boxes, accent: "text-blue-600" },
            { label: "Joy", val: filteredTotals.joys, icon: Package, accent: "text-blue-600" },
            { label: "Brutto (kg)", val: filteredTotals.brutto, icon: Package, accent: "text-blue-600" },
            { label: "Hajm (m³)", val: filteredTotals.vol, icon: Package, accent: "text-blue-600" },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-border/60 bg-slate-50/70 px-3.5 py-2.5">
              <p className={`text-2xl font-black leading-none ${c.accent}`}>{c.val || "—"}</p>
              <p className="text-[11px] text-muted-foreground font-bold mt-1.5">{c.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-2">
          * Raqamlar hali yo'lda qolgan (qabul qilinmagan) qismni ko'rsatadi.
        </p>
      </div>

      {/* Filters */}
      <div className="shrink-0 px-5 py-3 bg-white border-b border-[#EEF0F5] flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Fura, mijoz, ombor yoki tovar bo'yicha qidirish..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#DDE1EA] bg-[#F8F9FC] text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          />
        </div>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all ${
                status === f.key
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-[#6B7280] border-[#DDE1EA] hover:border-violet-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {destOptions.length > 0 && (
          <select
            value={destId}
            onChange={e => setDestId(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-[#DDE1EA] bg-white text-sm font-bold text-[#374151] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          >
            <option value="all">Barcha manzillar</option>
            {destOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        {!isSearching && groups.length > 1 && (
          <button
            onClick={toggleAllGroups}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DDE1EA] bg-white text-xs font-bold text-[#6B7280] hover:border-violet-400 hover:text-violet-700 transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            {allGroupsExpanded ? "Hammasini yig'ish" : "Hammasini yoyish"}
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="py-24 text-center text-sm font-bold text-[#9CA3AF]">Yuklanmoqda...</div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Truck className="w-8 h-8 text-[#D1D5DB]" />
            </div>
            <p className="text-sm font-bold text-[#9CA3AF]">
              {cargos.length === 0 ? "Hozircha yo'lda yuk yo'q" : "Filtrga mos yuk topilmadi"}
            </p>
            <p className="text-xs text-[#C4C9D4] mt-1">Chiqim qilingan, ammo hali qabul qilinmagan yuklar shu yerda ko'rinadi</p>
          </div>
        ) : isSearching ? (
          // Qidiruvda ham fura raqami bo'yicha jamlab ko'rsatamiz — bir fura = bitta blok
          <div className="max-w-3xl mx-auto space-y-2.5">
            {groupByVehicle(filtered).map(v => (
              <VehicleSection
                key={v.vehicleNumber}
                vehicleNumber={v.vehicleNumber}
                items={v.items}
                expanded={expandedVehicles.has(`search::${v.vehicleNumber}`)}
                onToggle={() => toggleVehicle(`search::${v.vehicleNumber}`)}
                expandedCards={expandedCards}
                onToggleCard={toggleCard}
                fmtDateTime={fmtDateTime}
                showDest
              />
            ))}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-2.5">
            {groups.map(g => (
              <GroupSection
                key={g.destId}
                group={g}
                expanded={expandedGroups.has(g.destId)}
                onToggleGroup={() => toggleGroup(g.destId)}
                expandedVehicles={expandedVehicles}
                onToggleVehicle={toggleVehicle}
                expandedCards={expandedCards}
                onToggleCard={toggleCard}
                fmtDateTime={fmtDateTime}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupSection({
  group, expanded, onToggleGroup, expandedVehicles, onToggleVehicle, expandedCards, onToggleCard, fmtDateTime,
}: {
  group: DestGroup;
  expanded: boolean;
  onToggleGroup: () => void;
  expandedVehicles: Set<string>;
  onToggleVehicle: (key: string) => void;
  expandedCards: Set<string>;
  onToggleCard: (id: string) => void;
  fmtDateTime: (s: string) => string;
}) {
  const vehicles = groupByVehicle(group.items);
  const partialVehicles = vehicles.filter(v => v.items.some(c => c.status === "partial")).length;
  return (
    <div className="bg-white rounded-2xl border border-[#DDE1EA] shadow-sm overflow-hidden">
      <button
        onClick={onToggleGroup}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-violet-600/10 flex items-center justify-center shrink-0">
          <MapPin className="w-4.5 h-4.5 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-foreground truncate">{group.destName}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {vehicles.length} ta fura{partialVehicles > 0 ? ` · ${partialVehicles} tasida qisman qabul` : ""}
          </p>
        </div>
        <ChevronDown className={`w-4.5 h-4.5 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-[#EEF0F5] bg-slate-50/40 p-2 space-y-2">
          {vehicles.map(v => (
            <VehicleSection
              key={v.vehicleNumber}
              vehicleNumber={v.vehicleNumber}
              items={v.items}
              expanded={expandedVehicles.has(`${group.destId}::${v.vehicleNumber}`)}
              onToggle={() => onToggleVehicle(`${group.destId}::${v.vehicleNumber}`)}
              expandedCards={expandedCards}
              onToggleCard={onToggleCard}
              fmtDateTime={fmtDateTime}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Bitta FURA — unga tegishli barcha yuklar (mijozlar) jamlangan yig'iladigan blok.
 *  Sarlavhada furadagi jami: mijoz, tovar, soni/joy/brutto/hajm (hali yo'ldagi qism). */
function VehicleSection({
  vehicleNumber, items, expanded, onToggle, expandedCards, onToggleCard, fmtDateTime, showDest = false,
}: {
  vehicleNumber: string;
  items: TransitCargo[];
  expanded: boolean;
  onToggle: () => void;
  expandedCards: Set<string>;
  onToggleCard: (id: string) => void;
  fmtDateTime: (s: string) => string;
  showDest?: boolean;
}) {
  const partialCount = items.filter(c => c.status === "partial").length;
  const clientCount = new Set(items.map(i => i.clientCode).filter(Boolean)).size;
  const productCount = items.reduce((s, c) => s + c.products.length, 0);
  const t = items.reduce(
    (a, c) => ({
      soni: a.soni + c.inTransitTotals.soni,
      joys: a.joys + c.inTransitTotals.joys,
      brutto: a.brutto + c.inTransitTotals.brutto,
      vol: a.vol + c.inTransitTotals.vol,
    }),
    { soni: 0, joys: 0, brutto: 0, vol: 0 },
  );
  const destLabel = showDest
    ? (() => {
        const ids = new Set(items.map(i => i.destWarehouseId));
        if (ids.size === 1) return items[0].destWarehouseName || "Manzil ko'rsatilmagan";
        return `${ids.size} manzil`;
      })()
    : null;

  return (
    <div className="bg-white rounded-xl border border-[#E3E7F0] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-violet-50/40 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-violet-600/10 flex items-center justify-center shrink-0">
          <Truck className="w-4 h-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black font-mono text-foreground">{vehicleNumber}</span>
            <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded-md">
              {items.length} yuk
            </span>
            {partialCount > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                {partialCount} qisman
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {destLabel ? <span className="text-violet-600 font-semibold">{destLabel} · </span> : null}
            {clientCount} mijoz · {productCount} tovar · {r2(t.soni)} dona · {r2(t.joys)} joy · {r2(t.brutto)} kg · {r3(t.vol)} m³
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-[#EEF0F5] divide-y divide-[#F1F2F6]">
          {groupByClient(items).map(cl =>
            cl.items.length > 1 ? (
              <ClientSection
                key={`c:${cl.clientCode}:${cl.clientName}`}
                clientCode={cl.clientCode}
                clientName={cl.clientName}
                items={cl.items}
                expandedCards={expandedCards}
                onToggleCard={onToggleCard}
                fmtDateTime={fmtDateTime}
              />
            ) : (
              <CompactRow
                key={cl.items[0].id}
                c={cl.items[0]}
                expanded={expandedCards.has(cl.items[0].id)}
                onToggle={() => onToggleCard(cl.items[0].id)}
                fmtDateTime={fmtDateTime}
                hideVehicle
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Bitta MIJOZ (ID) — shu furadagi o'sha mijozning barcha yuklari jamlangan ichki dropdown.
 *  Bir odamda 20-30 ta yuk bo'lsa ham bitta qatorga yig'iladi, ro'yxat cho'zilmaydi. */
function ClientSection({
  clientCode, clientName, items, expandedCards, onToggleCard, fmtDateTime,
}: {
  clientCode: string;
  clientName: string;
  items: TransitCargo[];
  expandedCards: Set<string>;
  onToggleCard: (id: string) => void;
  fmtDateTime: (s: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const partialCount = items.filter(c => c.status === "partial").length;
  const productCount = items.reduce((s, c) => s + c.products.length, 0);
  const t = items.reduce(
    (a, c) => ({
      soni: a.soni + c.inTransitTotals.soni,
      joys: a.joys + c.inTransitTotals.joys,
      brutto: a.brutto + c.inTransitTotals.brutto,
      vol: a.vol + c.inTransitTotals.vol,
    }),
    { soni: 0, joys: 0, brutto: 0, vol: 0 },
  );
  return (
    <div className="bg-violet-50/20">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-violet-50/50 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${partialCount > 0 ? "bg-amber-500" : "bg-violet-500"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black font-mono text-violet-700">{clientCode || "—"}</span>
            {clientName ? <span className="text-xs text-foreground truncate">{clientName}</span> : null}
            <span className="text-[10px] font-bold text-violet-700 bg-violet-100/70 border border-violet-200 px-1.5 py-0.5 rounded-md">
              {items.length} yuk
            </span>
            {partialCount > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                {partialCount} qisman
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {productCount} tovar · {r2(t.soni)} dona · {r2(t.joys)} joy · {r2(t.brutto)} kg · {r3(t.vol)} m³
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-[#F1F2F6] divide-y divide-[#F1F2F6] bg-white">
          {items.map(c => (
            <CompactRow
              key={c.id}
              c={c}
              expanded={expandedCards.has(c.id)}
              onToggle={() => onToggleCard(c.id)}
              fmtDateTime={fmtDateTime}
              hideVehicle
              hideClient
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CompactRow({
  c, expanded, onToggle, fmtDateTime, hideVehicle = false, hideClient = false,
}: {
  c: TransitCargo;
  expanded: boolean;
  onToggle: () => void;
  fmtDateTime: (s: string) => string;
  hideVehicle?: boolean;
  hideClient?: boolean;
}) {
  const isPartial = c.status === "partial";
  const prodPreview = c.products.map(p => p.name).filter(Boolean);
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50/60 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${isPartial ? "bg-amber-500" : "bg-violet-500"}`} />
        {!hideVehicle && (
          <span className="text-xs font-black font-mono text-foreground shrink-0 w-23 truncate">{c.vehicleNumber}</span>
        )}
        <span className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 w-32 truncate">
          <Building2 className="w-3 h-3 shrink-0" /> {c.sourceWarehouseName}
        </span>
        <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
          {hideClient ? (
            <span className="text-foreground">
              {prodPreview.slice(0, 3).join(", ") || "Yuk"}{prodPreview.length > 3 ? ` +${prodPreview.length - 3}` : ""}
            </span>
          ) : (
            <>
              <strong className="font-mono text-violet-700">{c.clientCode}</strong>
              {c.clientName ? <span className="text-foreground"> — {c.clientName}</span> : null}
            </>
          )}
        </span>
        {isPartial && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
            {c.receivedPercent}%
          </span>
        )}
        <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">{c.date}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-3.5 -mt-0.5">
          <CargoDetail c={c} fmtDateTime={fmtDateTime} />
        </div>
      )}
    </div>
  );
}

/** Bitta fura/yukning to'liq tafsiloti — qator bosilganda ochiladi */
function CargoDetail({ c, fmtDateTime }: { c: TransitCargo; fmtDateTime: (s: string) => string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-slate-50/40 px-3.5 py-3 space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-xs text-muted-foreground flex items-center gap-1 md:hidden">
          <Building2 className="w-3.5 h-3.5" /> Manba: <strong className="text-foreground">{c.sourceWarehouseName}</strong>
        </span>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" /> Manzil: <strong className="text-foreground">{c.destWarehouseName || "Ko'rsatilmagan"}</strong>
        </span>
        {c.clientPhone && (
          <span className="text-xs text-muted-foreground">Tel: <strong className="text-foreground">{c.clientPhone}</strong></span>
        )}
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> {c.date}
        </span>
        {c.photoCount > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Camera className="w-3.5 h-3.5" /> {c.photoCount}
          </span>
        )}
      </div>
      {c.note && <p className="text-[11px] italic text-muted-foreground">Izoh: {c.note}</p>}

      {/* Fura rasmlari (yo'lga chiqqan holati) */}
      {c.photos && c.photos.length > 0 && (
        <div>
          <p className="text-[10px] font-black text-muted-foreground/70 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Camera className="w-3 h-3" /> Fura rasmi ({c.photos.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {c.photos.map((ph, i) => (
              <img
                key={i}
                src={ph.dataUrl}
                alt={ph.name}
                onClick={() => window.open(ph.dataUrl, "_blank")}
                className="w-16 h-16 rounded-lg object-cover shrink-0 border border-border/60 cursor-pointer hover:opacity-90 transition-opacity"
              />
            ))}
          </div>
        </div>
      )}

      {/* Products */}
      {c.products.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-white overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
            <span>Tovar</span><span className="text-right">Soni</span><span className="text-right">Joy</span><span className="text-right">Brutto</span><span className="text-right">Hajm</span>
          </div>
          {c.products.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 text-[11px] border-t border-border/40 items-center">
              <span className="font-bold text-foreground truncate">
                {p.name}
                {p.sharePercent < 100 && <span className="text-amber-600 font-medium"> · {p.sharePercent}%</span>}
              </span>
              <span className="text-right text-foreground font-medium">{p.soni}</span>
              <span className="text-right text-muted-foreground">{p.joys}</span>
              <span className="text-right text-muted-foreground">{p.brutto} kg</span>
              <span className="text-right text-muted-foreground">{p.vol} m³</span>
            </div>
          ))}
        </div>
      )}

      {/* Totals: dispatched vs still in transit */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/60 bg-white px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mb-1">Jo'natilgan (jami)</p>
          <p className="text-[11px] text-foreground font-bold">
            {c.totals.soni} dona · {c.totals.joys} joy · {c.totals.brutto} kg · {c.totals.vol} m³
          </p>
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-violet-500 mb-1">Hozir yo'lda</p>
          <p className="text-[11px] text-violet-700 font-bold">
            {c.inTransitTotals.soni} dona · {c.inTransitTotals.joys} joy · {c.inTransitTotals.brutto} kg · {c.inTransitTotals.vol} m³
          </p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/50">Chiqim vaqti: {fmtDateTime(c.createdAt)}</p>
    </div>
  );
}
