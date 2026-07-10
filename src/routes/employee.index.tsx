import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useAppState, useSession } from "@/lib/store";
import { ClientDetailDialog } from "@/components/ClientDetailDialog";
import { AddClientDialog } from "@/components/AddClientDialog";
import { ClientCard } from "@/components/ClientCard";
import { UserPlus, RefreshCw, Search, Layers, ChevronDown, FileUp } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/lib/api/client";
import { playNotificationSound, showBrowserNotification } from "@/lib/notify";
import { getTashkentDayjs } from "@/lib/date-utils";
import type { Client, ClientStage } from "@/lib/types";
import { TelegramUserSelect } from "@/components/TelegramUserSelect";
import { TelegramMessageModal } from "@/components/TelegramMessageModal";
import { ImportExcelDialog } from "@/components/ImportExcelDialog";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 20;

const STAGES: { id: ClientStage | "all"; label: string }[] = [
  { id: "all", label: "Umumiy" },
  { id: "new", label: "Yangi" },
  { id: "no_answer", label: "Ko'tarmadi" },
  { id: "talked", label: "Gaplashildi" },
  { id: "sold", label: "Sotildi" },
];

export const Route = createFileRoute("/employee/")({
  component: EmployeeClients,
});

function EmployeeClients() {
  const { state, update } = useAppState();
  const session = useSession();
  const [activeCat, setActiveCat] = useState("");
  const [stage, setStage] = useState<ClientStage | "all">("new");
  const [openClient, setOpenClient] = useState<Client | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showImportExcel, setShowImportExcel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTelegramIds, setSelectedTelegramIds] = useState<string[]>([]);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const meName = session?.name || "Hodim";

  const fetchAll = async () => {
    setLoading(true);
    try {
      const catsReq = API.categories().catch((err) => {
        console.warn("Categories fetch failed:", err);
        return state.categories || [];
      });
      const clientsReq = API.clients().catch((err) => {
        console.warn("Clients fetch failed:", err);
        return state.clients || [];
      });
      const [cats, clients] = await Promise.all([catsReq, clientsReq]);

      update(s => ({ ...s, categories: cats, clients }));
      setOpenClient(prev => prev ? (clients.find(c => c.id === prev.id) || prev) : null);
      if (!activeCat && cats.length > 0) {
        setActiveCat(cats[0].id);
      }
    } catch (err) {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.role === "employee") {
      fetchAll();
      return API.initSocket((event, data) => {
        if (event === "clientCallStarted") {
          update(s => ({
            ...s,
            clients: s.clients.map(c => c.id === data.clientId ? {
              ...c,
              call: {
                ...c.call,
                inCallByEmployeeId: data.employeeId,
                inCallByName: data.employeeName,
                callStartedAt: getTashkentDayjs().toISOString()
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
        if (event === "clientUpdated") {
          // We could do a partial update here, but for simplicity we fetch all or update the specific one
          // Better to just refresh the specific category or all for now
          fetchAll();
        }
        // Socket qayta ulandi — uzilish davomida kelgan lidlar/o'zgarishlarni qoplaymiz
        if (event === "reconnected") {
          fetchAll();
        }
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
    }
  }, [session]);

  // ZAXIRA: socket qandaydir sabab bilan uzilib turgan bo'lsa ham, lidlar
  // ro'yxati 30 soniyada bir yangilanib turadi. Socket tirik payt ishlamaydi.
  useEffect(() => {
    if (session?.role !== "employee") return;
    const id = setInterval(() => {
      if (!API.isSocketConnected()) fetchAll();
    }, 30_000);
    return () => clearInterval(id);
  }, [session]);

  // Reminder Logic (Cleaned up local polling as backend Cron handles it now)
  useEffect(() => {
    // Only fetch for updates if needed, backend socket handles the rest
  }, []);

  const visibleCats = state.categories.filter((c) => !c.isArchive);
  const currentCat = visibleCats.find((c) => c.id === activeCat) || visibleCats[0];

  const filtered = useMemo(() => {
    return state.clients.filter((c) => {
      const matchesCat = c.categoryId === currentCat?.id;
      const matchesStage = stage === "all" || c.stage === stage;
      const matchesSearch = !search ||
        (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || "").includes(search);
      return matchesCat && matchesStage && matchesSearch;
    });
  }, [state.clients, currentCat, stage, search]);

  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeCat, stage, search]);

  const countsForCat = useMemo(() => {
    const inCat = state.clients.filter(c => c.categoryId === currentCat?.id);
    return {
      all: inCat.length,
      new: inCat.filter((c) => c.stage === "new").length,
      no_answer: inCat.filter((c) => c.stage === "no_answer").length,
      talked: inCat.filter((c) => c.stage === "talked").length,
      sold: inCat.filter((c) => c.stage === "sold").length,
    } as Record<string, number>;
  }, [state.clients, currentCat]);

  if (!session || session.role !== "employee") return null;


  return (
    <div className="p-6 md:p-10">
      <header className="mb-10 flex items-start justify-between flex-wrap gap-6">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Mijozlar</h1>
          <p className="text-muted-foreground mt-1.5 font-medium">Lidlar oqimi bilan ishlash va qaydlar</p>
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
          {session?.isActive !== false && (
            <>
              <button
                onClick={() => setShowImportConfirm(true)}
                title="Exceldan import qilish"
                className="inline-flex items-center justify-center p-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-green-500 hover:border-green-500/30 hover:shadow-sm transition-all"
              >
                <FileUp className="w-6 h-6" />
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
            {s.label} <span className="ml-2 text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded-full font-bold">{countsForCat[s.id]}</span>
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
                    // Show first page, last page, current page, and pages around current
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
                    // Show ellipses
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
          viewerRole="employee"
          viewerName={meName}
          viewerId={session?.id}
          enableCallActions
          readOnly={stage === "all"}
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
