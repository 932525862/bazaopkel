import { useState } from "react";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { API, assetUrl } from "@/lib/api/client";

interface TourService {
  nameEn: string;
  nameUz: string;
  nameRu: string;
}

interface TourFormProps {
  initialData?: any;
  onSuccess: () => void;
  onClose: () => void;
}

export function TourForm({ initialData, onSuccess, onClose }: TourFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nameEn: initialData?.nameEn || "",
    nameRu: initialData?.nameRu || "",
    nameUz: initialData?.nameUz || "",
    orders: initialData?.orders || 0,
    imageUrl: initialData?.imageUrl || "",
    link: initialData?.link || "",
    services: initialData?.services || ([] as TourService[]),
  });

  const [preview, setPreview] = useState(initialData?.imageUrl ? assetUrl(initialData.imageUrl) : "");

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Surat hajmi 5MB dan oshmasligi kerak");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setFormData(prev => ({ ...prev, imageUrl: base64 }));
      setPreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const addService = () => {
    setFormData(prev => ({
      ...prev,
      services: [...prev.services, { nameEn: "", nameUz: "", nameRu: "" }]
    }));
  };

  const removeService = (index: number) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.filter((_: TourService, i: number) => i !== index)
    }));
  };

  const updateService = (index: number, field: keyof TourService, value: string) => {
    setFormData(prev => {
      const newServices = [...prev.services];
      newServices[index] = { ...newServices[index], [field]: value };
      return { ...prev, services: newServices };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (initialData?.id) {
        await API.updateTour(initialData.id, formData);
        toast.success("Tur yangilandi");
      } else {
        await API.createTour(formData);
        toast.success("Yangi tur yaratildi");
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div className="bg-card w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-border shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="p-8 md:p-10">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-black text-foreground tracking-tight">
              {initialData ? "Turni tahrirlash" : "Yangi tur qo'shish"}
            </h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column: Names and Basic Info */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-2 uppercase tracking-wider">Nomi (UZ)</label>
                  <input
                    required
                    value={formData.nameUz}
                    onChange={e => setFormData({ ...formData, nameUz: e.target.value })}
                    className="w-full px-5 py-3.5 rounded-2xl border border-border bg-secondary/30 focus:ring-4 focus:ring-primary/10 focus:border-primary/40 outline-none transition-all font-medium"
                    placeholder="Masalan: Turkiyaga sayohat"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-2 uppercase tracking-wider">Name (EN)</label>
                  <input
                    required
                    value={formData.nameEn}
                    onChange={e => setFormData({ ...formData, nameEn: e.target.value })}
                    className="w-full px-5 py-3.5 rounded-2xl border border-border bg-secondary/30 focus:ring-4 focus:ring-primary/10 focus:border-primary/40 outline-none transition-all font-medium"
                    placeholder="E.g. Trip to Turkey"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-2 uppercase tracking-wider">Название (RU)</label>
                  <input
                    required
                    value={formData.nameRu}
                    onChange={e => setFormData({ ...formData, nameRu: e.target.value })}
                    className="w-full px-5 py-3.5 rounded-2xl border border-border bg-secondary/30 focus:ring-4 focus:ring-primary/10 focus:border-primary/40 outline-none transition-all font-medium"
                    placeholder="Например: Поездка в Турцию"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground mb-2 uppercase tracking-wider">Buyurtmalar</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formData.orders}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, "");
                        setFormData({ ...formData, orders: parseInt(val) || 0 });
                      }}
                      className="w-full px-5 py-3.5 rounded-2xl border border-border bg-secondary/30 focus:ring-4 focus:ring-primary/10 focus:border-primary/40 outline-none transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground mb-2 uppercase tracking-wider">Link</label>
                    <input
                      value={formData.link}
                      onChange={e => setFormData({ ...formData, link: e.target.value })}
                      className="w-full px-5 py-3.5 rounded-2xl border border-border bg-secondary/30 focus:ring-4 focus:ring-primary/10 focus:border-primary/40 outline-none transition-all font-medium"
                      placeholder="e.g. turkey-form"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Image */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-4 uppercase tracking-wider">Tur rasmi</label>
                  <div className="relative group aspect-video rounded-[32px] overflow-hidden border-2 border-dashed border-border flex items-center justify-center bg-secondary/20">
                    {preview ? (
                      <>
                        <img src={preview} className="w-full h-full object-cover" alt="Preview" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <label className="cursor-pointer p-4 bg-white/20 backdrop-blur-md rounded-full text-white hover:scale-110 transition-transform">
                            <Upload className="w-6 h-6" />
                            <input type="file" onChange={handleImageChange} className="hidden" accept="image/*" />
                          </label>
                        </div>
                      </>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-3 text-muted-foreground hover:text-primary transition-colors">
                        <div className="p-4 bg-card rounded-full shadow-sm border border-border">
                          <Upload className="w-8 h-8" />
                        </div>
                        <span className="font-bold">Rasm yuklash</span>
                        <input type="file" onChange={handleImageChange} className="hidden" accept="image/*" />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Services Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-foreground">Xizmatlar</h3>
                <button
                  type="button"
                  onClick={addService}
                  className="inline-flex items-center gap-2 text-sm font-black text-primary hover:bg-primary/5 px-4 py-2 rounded-xl transition-all"
                >
                  <Plus className="w-4 h-4" /> Xizmat qo'shish
                </button>
              </div>
              <div className="space-y-4">
                {formData.services.map((svc: TourService, i: number) => (
                  <div key={i} className="p-6 rounded-[24px] bg-secondary/20 border border-border flex flex-col md:flex-row gap-4 relative">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase font-black text-muted-foreground mb-1 block">UZ</label>
                      <input
                        value={svc.nameUz}
                        onChange={e => updateService(i, "nameUz", e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-border bg-card focus:border-primary/40 outline-none transition-all text-sm"
                        placeholder="Aviabilet"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] uppercase font-black text-muted-foreground mb-1 block">RU</label>
                      <input
                        value={svc.nameRu}
                        onChange={e => updateService(i, "nameRu", e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-border bg-card focus:border-primary/40 outline-none transition-all text-sm"
                        placeholder="Авиабилет"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] uppercase font-black text-muted-foreground mb-1 block">EN</label>
                      <input
                        value={svc.nameEn}
                        onChange={e => updateService(i, "nameEn", e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-border bg-card focus:border-primary/40 outline-none transition-all text-sm"
                        placeholder="Flight ticket"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeService(i)}
                      className="p-2 text-destructive hover:bg-destructive/5 rounded-xl transition-all self-end"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
                {formData.services.length === 0 && (
                  <p className="text-center text-muted-foreground bg-secondary/10 py-10 border border-dashed border-border rounded-[24px]">Xizmatlar yo'q</p>
                )}
              </div>
            </div>

            <div className="pt-8 flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-4 bg-primary text-primary-foreground font-black text-lg rounded-[20px] shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? "Saqlanmoqda..." : "Saqlash"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-8 py-4 bg-secondary text-foreground font-black text-lg rounded-[20px] hover:bg-secondary/80 transition-all"
              >
                Bekor qilish
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
