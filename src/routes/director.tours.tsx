import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, RefreshCw, Pencil, Trash2, Globe, ListChecks, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { API, assetUrl } from "@/lib/api/client";
import { TourForm } from "@/components/TourForm";

export const Route = createFileRoute("/director/tours")({
  component: DirectorTours,
});

function DirectorTours() {
  const [tours, setTours] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTour, setEditingTour] = useState<any>(null);

  const fetchTours = async () => {
    setLoading(true);
    try {
      const data = await API.tours();
      setTours(data);
    } catch (err: any) {
      toast.error("Turlarni yuklashda xatolik: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTours();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" turini o'chirib tashlamoqchimisiz?`)) return;
    try {
      await API.deleteTour(id);
      toast.success("Tur o'chirildi");
      fetchTours();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-6 md:p-10">
      <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Turlar</h1>
          <p className="text-muted-foreground mt-2 font-medium">Sayyohlik paketlarini boshqarish</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={fetchTours}
            className="p-4 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/40 hover:shadow-sm transition-all active:scale-95"
          >
            <RefreshCw className={`w-6 h-6 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => {
              setEditingTour(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-primary text-primary-foreground font-black shadow-xl shadow-primary/20 hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus className="w-6 h-6" /> Yangi tur
          </button>
        </div>
      </header>

      {loading && tours.length === 0 ? (
        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-96 rounded-[40px] bg-secondary/40 animate-pulse border border-border/50" />
          ))}
        </div>
      ) : tours.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-[48px] p-24 text-center">
          <div className="w-24 h-24 bg-secondary rounded-[32px] flex items-center justify-center mx-auto mb-8 text-muted-foreground/30">
            <Globe className="w-12 h-12" />
          </div>
          <h3 className="text-2xl font-black text-foreground mb-3">Turlar mavjud emas</h3>
          <p className="text-muted-foreground max-w-sm mx-auto font-medium">Siz hali birorta ham sayyohlik paketini qo'shmagansiz.</p>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {tours.map((tour) => (
            <div
              key={tour.id}
              className="group bg-card rounded-[40px] border border-border/60 overflow-hidden hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/20 transition-all duration-500 flex flex-col"
            >
              <div className="relative aspect-video overflow-hidden bg-secondary/20">
                {tour.imageUrl ? (
                  <img
                    src={assetUrl(tour.imageUrl)}
                    alt={tour.nameUz}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                    <ImageIcon className="w-16 h-16" />
                  </div>
                )}
                <div className="absolute top-6 left-6 px-4 py-2 bg-black/40 backdrop-blur-md rounded-xl text-white text-xs font-black uppercase tracking-widest">
                  {tour.orders}ta buyurtmalar
                </div>
              </div>
              <div className="p-8 flex-1 flex flex-col">
                <div className="mb-6 flex-1">
                  <h3 className="text-2xl font-black text-foreground mb-4 line-clamp-1 group-hover:text-primary transition-colors">{tour.nameUz}</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                      <Globe className="w-4 h-4 text-primary/60" />
                      <span>{tour.nameRu}</span>
                    </div>
                    <div className="flex items-start gap-3 text-sm font-medium text-muted-foreground">
                      <ListChecks className="w-4 h-4 text-primary/60 mt-0.5" />
                      <div className="flex-1 flex flex-wrap gap-2">
                        {tour.services?.slice(0, 3).map((svc: any, i: number) => (
                          <span key={i} className="bg-secondary/40 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-border/40">
                            {svc.nameUz}
                          </span>
                        ))}
                        {(tour.services?.length || 0) > 3 && (
                          <span className="text-[11px] font-black text-primary">+{tour.services.length - 3} yana</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-6 border-t border-border/40">
                  <button
                    onClick={() => {
                      setEditingTour(tour);
                      setShowForm(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary text-foreground font-black hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                  >
                    <Pencil className="w-4 h-4" /> Tahrirlash
                  </button>
                  <button
                    onClick={() => handleDelete(tour.id, tour.nameUz)}
                    className="p-3 rounded-2xl border border-destructive/20 text-destructive hover:bg-destructive hover:text-white transition-all duration-300"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TourForm
          initialData={editingTour}
          onSuccess={fetchTours}
          onClose={() => {
            setShowForm(false);
            setEditingTour(null);
          }}
        />
      )}
    </div>
  );
}
