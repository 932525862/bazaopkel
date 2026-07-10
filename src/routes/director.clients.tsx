import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { getStoredClientIds } from "@/lib/client-ids";
import { useAppState, useSession } from "@/lib/store";
import { ClientDetailDialog } from "@/components/ClientDetailDialog";
import { AddClientDialog } from "@/components/AddClientDialog";
import { ClientCard } from "@/components/ClientCard";
import { UserPlus, Search, RefreshCw, Layers, ChevronDown, Download, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import type { Client, ClientStage } from "@/lib/types";
import { API } from "@/lib/api/client";
import { playNotificationSound, showBrowserNotification } from "@/lib/notify";
import { TelegramUserSelect } from "@/components/TelegramUserSelect";
import { TelegramMessageModal } from "@/components/TelegramMessageModal";
import { ImportExcelDialog } from "@/components/ImportExcelDialog";
import { ConfirmModal } from "@/components/ConfirmModal";
import { getTashkentDayjs } from "@/lib/date-utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

// Add an aggregate "Umumiy" tab (id: 'all') that shows clients from all stages.
const STAGES: { id: string; label: string }[] = [
  { id: "all", label: "Umumiy" },
  { id: "new", label: "Yangi" },
  { id: "no_answer", label: "Ko'tarmadi" },
  { id: "talked", label: "Gaplashildi" },
  { id: "sold", label: "Sotildi" },
  { id: "id_assigned", label: "ID" },
];

const ITEMS_PER_PAGE = 20;

export const Route = createFileRoute("/director/clients")({
  component: DirectorClients,
});

function DirectorClients() {
  const { state, update } = useAppState();
  const session = useSession();
  const [activeCat, setActiveCat] = useState("");
  // `stage` can be one of ClientStage values or the special 'all' value
  const [stage, setStage] = useState<string>("new");
  const [openClient, setOpenClient] = useState<Client | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showImportExcel, setShowImportExcel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTelegramIds, setSelectedTelegramIds] = useState<string[]>([]);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [storedIds, setStoredIds] = useState<Record<string, string>>(() => getStoredClientIds());

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cats, clients] = await Promise.all([
        API.categories(),
        API.clients()
      ]);
      update(s => ({ ...s, categories: cats, clients }));
      setOpenClient(prev => prev ? (clients.find(c => c.id === prev.id) || prev) : null);
      if (!activeCat && cats.length > 0) {
        setActiveCat(cats[0].id);
      }
    } catch (err) {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
      setStoredIds(getStoredClientIds());
    }
  };

  const exportLeads = async () => {
    if (!currentCat) {
      toast.error("Bo'lim tanlanmadi");
      return;
    }
    const clientsInCat = state.clients.filter(c => c.categoryId === currentCat.id);
    if (clientsInCat.length === 0) {
      toast.info("Ushbu bo'limda hech qanday lid yo'q");
      return;
    }
    try {
      setExporting(true);
      // Build CSV with ordered columns and cleaned values
      // Collect all data keys present in this category so we can output them as separate columns
      const dataKeysSet = new Set<string>();
      clientsInCat.forEach(c => {
        if (c.data) Object.keys(c.data).forEach(k => dataKeysSet.add(k));
      });
      const dataKeys = Array.from(dataKeysSet).sort();

      const headers = [
        "name",
        "phone",
        "stage",
        "formTitle",
        "createdAt",
        "telegramUsername",
        "description",
        "notes",
        ...dataKeys,
      ];

      const escape = (v: unknown) => {
        if (v === null || v === undefined) return '""';
        const s = typeof v === 'string' ? v : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      };

      const normalizePhone = (raw?: string) => {
        if (!raw) return "";
        const digits = (raw || "").replace(/\D/g, "");
        if (!digits) return "";
        // Uzbekistan heuristics: if 9 digits (local) -> +998XXXXXXXXX
        if (digits.length === 9) return `+998${digits}`;
        // if starts with 0 and 10 digits -> drop leading 0 and add +998
        if (digits.length === 10 && digits.startsWith('0')) return `+998${digits.slice(1)}`;
        // if already has country code 998
        if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
        // fallback: prefix plus
        return `+${digits}`;
      };

      const formatDate = (iso?: string) => {
        if (!iso) return "";
        // Qurilma (brauzer) vaqt zonasidan qat'i nazar, har doim Toshkent
        // vaqtida — aks holda eksport qilingan CSV'dagi vaqt operator
        // ko'rgan haqiqiy vaqtdan farq qilib qolishi mumkin edi.
        const d = getTashkentDayjs(iso);
        if (!d.isValid()) return iso;
        return d.format("YYYY-MM-DD HH:mm");
      };

      const rows = clientsInCat.map(c => {
        const notes = (c.notes || []).map(n => `${n.authorName || n.authorRole}: ${n.text.replace(/\s+/g, ' ')}`).join(' | ');
        const rowBase = [
          c.name || "",
          normalizePhone(c.phone),
          c.stage || "",
          c.formTitle || "",
          formatDate(c.createdAt),
          c.telegramUsername || "",
          c.description || "",
          notes,
        ];
        const dataValues = dataKeys.map(k => (c.data && c.data[k]) ? c.data[k] : "");
        return [...rowBase, ...dataValues].map(escape).join(',');
      });

      const csv = [headers.map(escape).join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fileNameSafe = (currentCat.name || "leads").replace(/[^a-z0-9_-]/gi, "_");
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.setAttribute("download", `leads_${fileNameSafe}_${date}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Lidlar CSV formatda yuklab olindi");
    } catch (err) {
      console.error(err);
      toast.error("Yuklash davomida xatolik yuz berdi");
    } finally {
      setExporting(false);
    }
  };


  useEffect(() => {
    fetchAll();
    const unsub = API.initSocket((event: string, data: any) => {
      if (event === "clientCallStarted") {
        update(s => ({
          ...s,
          clients: s.clients.map(c => c.id === data.clientId ? {
            ...c,
            call: {
              ...c.call,
              inCallByEmployeeId: data.employeeId,
              inCallByName: data.employeeName,
              callStartedAt: new Date().toISOString()
            }
          } : c)
        }));
      }
      if (event === "clientCallEnded") {
        update(s => ({
          ...s,
          clients: s.clients.map(c => c.id === data.clientId ? {
            ...c,
            call: { ...c.call, inCallByEmployeeId: undefined, inCallByName: undefined, callStartedAt: undefined }
          } : c)
        }));
      }
      if (event === "clientUpdated") fetchAll();
      // Socket qayta ulandi — uzilish davomida kelgan lidlar/o'zgarishlarni qoplaymiz
      if (event === "reconnected") fetchAll();
      if (event === "clientReminder") {
        playNotificationSound();
        showBrowserNotification("Qayta qo'ng'iroq", {
          body: `${data.name || "Mijoz"} bilan bog'lanish vaqti keldi`,
          icon: "/favicon.ico"
        });
        toast.info(`Eslatma: ${data.name} bilan bog'lanish vaqti keldi`);
      }
      if (event === "paymentReminder") {
        playNotificationSound();
        showBrowserNotification("To'lov eslatmasi", {
          body: `${data.name || "Mijoz"} uchun to'lov vaqti o'tdi`,
          icon: "/favicon.ico"
        });
        toast.warning(`To'lov: ${data.name} uchun to'lov vaqti o'tdi`, {
          duration: 10000,
        });
      }
    });
    return () => unsub();
  }, []);

  // ZAXIRA: socket qandaydir sabab bilan uzilib turgan bo'lsa ham, lidlar
  // ro'yxati 30 soniyada bir yangilanib turadi. Socket tirik payt ishlamaydi.
  useEffect(() => {
    const id = setInterval(() => {
      if (!API.isSocketConnected()) fetchAll();
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Reminder Logic (Cleaned up local polling as backend Cron handles it now)
  useEffect(() => {
    // Only fetch for updates if needed
  }, []);

  const visibleCats = state.categories.filter(c => !c.isArchive);
  const currentCat = visibleCats.find((c) => c.id === activeCat) || visibleCats[0];

  const filtered = useMemo(() => {
    return state.clients.filter((c) => {
      const matchesCat = c.categoryId === currentCat?.id;
      const matchesStage =
        stage === "all" ? true :
        stage === "id_assigned" ? !!(c.clientCode || storedIds[c.id]) :
        c.stage === stage;
      const matchesSearch = !search ||
        (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || "").includes(search);
      return matchesCat && matchesStage && matchesSearch;
    });
  }, [state.clients, currentCat, stage, search, storedIds]);

  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeCat, stage, search]);

  const counts: Record<string, number> = useMemo(() => {
    const inCat = state.clients.filter(c => c.categoryId === currentCat?.id);
    return {
      all: inCat.length,
      new: inCat.filter((c) => c.stage === "new").length,
      no_answer: inCat.filter((c) => c.stage === "no_answer").length,
      talked: inCat.filter((c) => c.stage === "talked").length,
      sold: inCat.filter((c) => c.stage === "sold").length,
      id_assigned: inCat.filter((c) => !!(c.clientCode || storedIds[c.id])).length,
    };
  }, [state.clients, currentCat, storedIds]);

  return (
    <div className="p-6 md:p-10">
      <header className="mb-10 flex items-start justify-between flex-wrap gap-6">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Mijozlar</h1>
          <p className="text-muted-foreground mt-1.5 font-medium">Lidlar oqimi va sotuv operatsiyalari</p>
        </div>
        <div className="flex gap-3">
          <TelegramUserSelect
            onSelected={setSelectedTelegramIds}
            onSendMessage={() => setShowTelegramModal(true)}
          />
          <button
            onClick={fetchAll}
            className="p-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <RefreshCw className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowExportConfirm(true)}
            disabled={exporting}
            className="p-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <Download className={`w-6 h-6 ${exporting ? 'animate-spin' : ''}`} />
          </button>
          {session?.isActive !== false && (
            <>
              <button
                onClick={() => setShowImportConfirm(true)}
                title="Exceldan import qilish"
                className="inline-flex items-center justify-center p-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-green-500 hover:border-green-500/30 hover:shadow-sm transition-all"
              >
                <UploadIcon className="w-6 h-6" />
              </button>
              <button
                onClick={() => setShowAddClient(true)}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <UserPlus className="w-5 h-5" /> Yangi mijoz
              </button>
            </>
          )}
        </div>
      </header>

      {showTelegramModal && (
        <TelegramMessageModal
          selectedTelegramIds={selectedTelegramIds}
          onClose={() => setShowTelegramModal(false)}
          onSuccess={() => {
            setShowTelegramModal(false);
            setSelectedTelegramIds([]);
          }}
        />
      )}

      {/* Search & Tabs */}
      <div className="flex flex-col xl:flex-row gap-6 mb-10">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Mijoz ismi yoki tel raqami orqali qidirish..."
            className="w-full pl-12 pr-4 py-4 rounded-[20px] border border-border bg-card focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/30 transition-all font-medium text-lg"
          />
        </div>
        <div className="relative group min-w-[240px]">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary group-focus-within:scale-110 transition-transform">
            <Layers className="w-5 h-5" />
          </div>
          <select
            value={activeCat}
            onChange={(e) => setActiveCat(e.target.value)}
            className="w-full pl-12 pr-12 py-4 rounded-[20px] border border-border bg-card appearance-none focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/30 transition-all font-bold text-foreground cursor-pointer shadow-sm hover:border-primary/20"
          >
            {visibleCats.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
            <ChevronDown className="w-5 h-5" />
          </div>
        </div>
      </div>


      {/* Stage selector */}
      <div className="flex flex-wrap gap-1.5 mb-10 p-1.5 bg-secondary/50 rounded-[22px] w-fit border border-border/40">
        {STAGES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStage(s.id)}
            className={`px-6 py-2.5 rounded-[16px] text-sm font-black uppercase tracking-widest transition-all ${stage === s.id
                ? "bg-card text-foreground shadow-sm scale-[1.02]"
                : "text-muted-foreground hover:text-foreground hover:bg-card/30"
              }`}
          >
            {s.label} <span className="ml-2 text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded-full font-bold">{counts[s.id]}</span>
          </button>
        ))}
      </div>

      {loading && state.clients.length === 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="h-44 rounded-[28px] bg-secondary/40 animate-pulse border border-border/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[40px] p-24 text-center">
          <div className="w-24 h-24 bg-secondary rounded-[32px] flex items-center justify-center mx-auto mb-6 text-muted-foreground/30">
            <Layers className="w-12 h-12" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Mijozlar topilmadi</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">Siz tanlagan filtrlar bo'yicha hech qanday mijoz aniqlanmadi.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-10">
            {paginatedClients.map((c) => (
              <ClientCard key={c.id} client={c} onClick={() => setOpenClient(c)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center mt-10">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)); }}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>

                  {[...Array(totalPages)].map((_, i) => {
                    const page = i + 1;
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            isActive={page === currentPage}
                            onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    }
                    if (page === currentPage - 2 || page === currentPage + 2) {
                      return (
                        <PaginationItem key={page}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }
                    return null;
                  })}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)); }}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        isOpen={showExportConfirm}
        onClose={() => setShowExportConfirm(false)}
        onConfirm={() => {
          setShowExportConfirm(false);
          exportLeads();
        }}
        title="Eksport qilish"
        description="Ma'lumotlarni CSV formatida yuklab olishni tasdiqlaysizmi?"
        confirmLabel="Eksport"
        tone="info"
      />

      <ConfirmModal
        isOpen={showImportConfirm}
        onClose={() => setShowImportConfirm(false)}
        onConfirm={() => {
          setShowImportConfirm(false);
          setShowImportExcel(true);
        }}
        title="Import qilish"
        description="Excel fayldan mijozlarni import qilishni tasdiqlaysizmi?"
        confirmLabel="Import"
        tone="primary"
      />

      {openClient && (
        <ClientDetailDialog
          client={openClient}
          state={state}
          onRefresh={fetchAll}
          onClose={() => setOpenClient(null)}
          viewerRole="director"
          viewerName={state.director.name}
          viewerId={session?.id}
        />
      )}

      {showImportExcel && (
        <ImportExcelDialog
          state={state}
          defaultCategoryId={currentCat?.id}
          onImported={fetchAll}
          onClose={() => setShowImportExcel(false)}
        />
      )}

      {showAddClient && (
        <AddClientDialog
          state={state}
          defaultCategoryId={currentCat?.id}
          onCreated={fetchAll}
          onClose={() => setShowAddClient(false)}
        />
      )}
    </div>
  );
}
