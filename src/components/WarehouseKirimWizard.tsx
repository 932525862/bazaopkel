import { useState, useMemo, useEffect, useRef } from "react";
import {
  X, ChevronLeft, ChevronRight, Plus, Trash2,
  User, Users, Upload, ArrowDownCircle, Package, Ruler,
  Weight, MessageSquare, LayoutList, MapPin, Clock, Calendar,
  ChevronDown, ChevronUp, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useAppState } from "@/lib/store";
import { getStoredClientIds } from "@/lib/client-ids";
import { API } from "@/lib/api/client";
import {
  addKirimRecord,
  type KirimProduct,
  type KirimMeasurement,
  type KirimPlace,
  type KirimAttachment,
} from "@/lib/warehouse";
import { getTashkentDayjs } from "@/lib/date-utils";

// ─── Constants ────────────────────────────────────────────
const MEASUREMENT_UNITS = [
  "kg", "g", "tonna", "litr", "ml", "m³", "sm³",
  "m", "sm", "mm", "dona", "qop", "quti", "to'plam", "paket",
];
const PLACE_BASE_UNITS = ["joy", "konteyner", "palet", "yashik", "qop", "quti"];
const WEIGHT_UNITS = ["kg", "g", "tonna", "pound"];
const DIMENSION_UNITS = ["sm", "mm", "m"];

const STEPS = [
  { id: 1, label: "Sana va Mijoz" },
  { id: 2, label: "Topshiriq" },
  { id: 3, label: "Tovar" },
];

// ─── Helpers ──────────────────────────────────────────────
function makeProduct(): KirimProduct {
  return {
    id: crypto.randomUUID(),
    measurements: [{ id: crypto.randomUUID(), value: "", unit: "kg" }],
    places: [{ id: crypto.randomUUID(), count: "", unit: "joy" }],
    quantity: "",
    width: "", length: "", height: "",
    dimensionUnit: "sm",
    volumeMode: "places",
    manualVolumes: [{ id: crypto.randomUUID(), value: "" }],
    totalVolume: "",
    brutto: "", bruttoUnit: "kg",
    netto: "", nettoUnit: "kg",
    note: "",
  };
}

// Bitta birlik (1 joy / 1 tovar) hajmi, m³ da — width×length×height dan
function calcUnitCube(p: KirimProduct): number {
  const w = parseFloat(p.width);
  const l = parseFloat(p.length);
  const h = parseFloat(p.height);
  if (!w || !l || !h) return 0;
  const raw = w * l * h;
  // Convert to m³: mm → ÷1_000_000_000, sm(cm) → ÷1_000_000, m → ÷1
  const divisor =
    p.dimensionUnit === "m" ? 1 :
    p.dimensionUnit === "mm" ? 1_000_000_000 :
    1_000_000;
  return raw / divisor;
}

function formatM3(value: number): string {
  if (!value) return "";
  return `${parseFloat(value.toFixed(6)).toString()} m³`;
}

// Jami hajm: tanlangan usulga ko'ra hisoblanadi
// - "places"   → 1 birlik hajmi × joylar soni
// - "quantity" → 1 birlik hajmi × tovar soni
// - "manual"   → qo'lda kiritilgan hajmlar yig'indisi
function calcVolume(p: KirimProduct): string {
  const mode = p.volumeMode || "places";
  if (mode === "manual") {
    const total = (p.manualVolumes || []).reduce((s, m) => s + (parseFloat(m.value) || 0), 0);
    return formatM3(total);
  }
  const unitCube = calcUnitCube(p);
  if (!unitCube) return "";
  const multiplier = mode === "quantity"
    ? (parseFloat(p.quantity) || 0)
    : p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
  if (!multiplier) return "";
  return formatM3(unitCube * multiplier);
}

// Kirim hujjatini o'qiydi. RASM bo'lsa — 1200px gacha kichraytirib, JPEG (0.8) qilib
// siqadi (katta base64 bilan bazani va so'rovni shishirmaslik uchun). Boshqa fayllar
// (pdf/doc/xlsx) o'zgarishsiz o'qiladi.
// Rasm bo'lmagan fayllar (pdf/doc/xlsx) siqilmaydi va base64 holida bazaga
// yoziladi — juda katta fayl har bir kirim GET'ini og'irlashtiradi. Shu sabab limit.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 MB

function readAttachmentFile(file: File): Promise<KirimAttachment> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/") && file.size > MAX_ATTACHMENT_BYTES) {
      reject(new Error(`"${file.name}" juda katta (maks. 3 MB)`));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (file.type.startsWith("image/")) {
        const img = new Image();
        img.onload = () => {
          const MAX = 1200;
          const scale = Math.min(1, MAX / img.width, MAX / img.height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          const out = canvas.toDataURL("image/jpeg", 0.8);
          const size = Math.round(((out.length - 22) * 3) / 4); // taxminiy bayt hajmi
          resolve({ name: file.name, type: "image/jpeg", size, dataUrl: out });
        };
        img.onerror = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl });
        img.src = dataUrl;
      } else {
        resolve({ name: file.name, type: file.type, size: file.size, dataUrl });
      }
    };
    // MUHIM: o'qish xatosida promise osilib qolmasin (ilgari onerror yo'q edi —
    // Promise.all abadiy kutar, fayllar jimgina qo'shilmay qolardi).
    reader.onerror = () => reject(new Error(`"${file.name}" faylini o'qib bo'lmadi`));
    reader.readAsDataURL(file);
  });
}

// ─── Section header ───────────────────────────────────────
function SectionLabel({ icon: Icon, title, required }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-blue-600" />
      </div>
      <span className="text-xs font-black text-foreground uppercase tracking-wider">
        {title}
        {required && <span className="text-destructive ml-1">*</span>}
      </span>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────
interface Props {
  warehouseId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface EmployeeOption {
  id: string;
  name: string;
}

// ─── Component ────────────────────────────────────────────
export function WarehouseKirimWizard({ warehouseId, onClose, onSaved }: Props) {
  const { state } = useAppState();

  // Step 1 – Sana va Mijoz
  // Sana TASHKENT (UTC+5) bo'yicha — toISOString() (UTC) 00:00–05:00 orasida
  // kechagi sanani berar edi.
  const [date, setDate] = useState(getTashkentDayjs().format("YYYY-MM-DD"));
  const [clientCode, setClientCode] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientError, setClientError] = useState("");
  // Mijozlar backend'dan yuklanadi — localStorage keshiga bog'liq bo'lmaslik uchun.
  const [clients, setClients] = useState<any[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  // Step 2 – Topshiriq
  const [taskDescription, setTaskDescription] = useState("");
  const [taskNote, setTaskNote] = useState("");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [assignedEmployee, setAssignedEmployee] = useState("");
  const [deadline, setDeadline] = useState(
    getTashkentDayjs().add(7, "day").format("YYYY-MM-DD"),
  );
  const [notifyAt, setNotifyAt] = useState("09:00");
  const [attachments, setAttachments] = useState<KirimAttachment[]>([]);

  // Step 3 – Products
  const [completedProducts, setCompletedProducts] = useState<KirimProduct[]>([]);
  const [cur, setCur] = useState<KirimProduct>(makeProduct());
  const [customPlaceUnits, setCustomPlaceUnits] = useState<string[]>([]);
  const [newPlaceUnit, setNewPlaceUnit] = useState("");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  const allPlaceUnits = [...PLACE_BASE_UNITS, ...customPlaceUnits];

  // Wizard
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const storedIds = useMemo(() => getStoredClientIds(), []);
  const unitCube = useMemo(() => calcUnitCube(cur),
    [cur.width, cur.length, cur.height, cur.dimensionUnit]);
  const volume = useMemo(() => calcVolume(cur), [
    cur.width, cur.length, cur.height, cur.dimensionUnit,
    cur.volumeMode, cur.places, cur.quantity, cur.manualVolumes,
  ]);

  // Fetch employees from API on mount
  useEffect(() => {
    API.employees()
      .then(list => setEmployees(list.map(e => ({
        id: e.id,
        name: `${e.firstName} ${e.lastName}`.trim(),
      }))))
      .catch(() => {});
  }, []);

  // Fetch clients from API on mount — kod bo'yicha qidiruv server ma'lumotidan ishlaydi,
  // Mijozlar sahifasiga oldin kirilgan-kirilmaganidan qat'i nazar.
  useEffect(() => {
    setClientsLoading(true);
    API.clients()
      .then(list => setClients(list))
      .catch(() => setClients([]))
      .finally(() => setClientsLoading(false));
  }, []);

  // ── Client lookup ──────────────────────────────────────
  const lookupClient = (code: string) => {
    setClientError("");
    const norm = code.toUpperCase().trim();
    if (!norm) { setClientName(""); setClientPhone(""); return; }

    // 1) Asosiy manba — server: mijozning clientCode maydoni bo'yicha to'g'ridan-to'g'ri.
    let client: any = clients.find(c => (c.clientCode || "").toUpperCase().trim() === norm);

    // 2) Zaxira — localStorage keshi (crm_client_ids): kod → clientId → mijoz.
    if (!client) {
      const found = Object.entries(storedIds).find(([, v]) => v === norm);
      if (found) {
        const id = found[0];
        client = clients.find(c => c.id === id) || state.clients.find(c => c.id === id);
      }
    }

    if (!client) {
      // Mijozlar hali yuklanayotgan bo'lsa — foydalanuvchini yo'naltiramiz.
      setClientError(
        clientsLoading
          ? "Mijozlar yuklanmoqda, bir soniyadan so'ng qayta urinib ko'ring"
          : "Bu ID raqamga mos mijoz topilmadi",
      );
      setClientName(""); setClientPhone("");
      return;
    }

    setClientName(client.name || "");
    setClientPhone(client.phone || "");
    if (!selectedEmployeeId) {
      const empNote = client.notes?.find((n: any) => n.authorRole === "employee");
      if (empNote) setAssignedEmployee(empNote.authorName);
    }
  };

  // ── Product helpers ────────────────────────────────────
  // MUHIM: barcha yangilagichlar FUNKSIONAL setState ishlatadi (setCur(p => ...)),
  // ya'ni doim eng oxirgi holatdan (p) o'qiydi. Ilgari `cur` (eski nusxa) ishlatilgani
  // sababli tez ketma-ket o'zgarishlarda ba'zi yangilanishlar yo'qolib, qiymat eski
  // holiga qaytib qolar edi.
  const upd = (patch: Partial<KirimProduct>) => setCur(p => ({ ...p, ...patch }));

  const updM = (id: string, f: keyof KirimMeasurement, v: string) =>
    setCur(p => ({ ...p, measurements: p.measurements.map(m => m.id === id ? { ...m, [f]: v } : m) }));
  const addM = () =>
    setCur(p => ({ ...p, measurements: [...p.measurements, { id: crypto.randomUUID(), value: "", unit: "kg" }] }));
  const delM = (id: string) =>
    setCur(p => p.measurements.length <= 1 ? p : ({ ...p, measurements: p.measurements.filter(m => m.id !== id) }));

  const updP = (id: string, f: keyof KirimPlace, v: string) =>
    setCur(p => ({ ...p, places: p.places.map(pl => pl.id === id ? { ...pl, [f]: v } : pl) }));
  const addP = () =>
    setCur(p => ({ ...p, places: [...p.places, { id: crypto.randomUUID(), count: "", unit: "joy" }] }));
  const delP = (id: string) =>
    setCur(p => p.places.length <= 1 ? p : ({ ...p, places: p.places.filter(pl => pl.id !== id) }));

  const updMV = (id: string, v: string) =>
    setCur(p => ({ ...p, manualVolumes: p.manualVolumes.map(m => m.id === id ? { ...m, value: v } : m) }));
  const addMV = () =>
    setCur(p => ({ ...p, manualVolumes: [...p.manualVolumes, { id: crypto.randomUUID(), value: "" }] }));
  const delMV = (id: string) =>
    setCur(p => p.manualVolumes.length <= 1 ? p : ({ ...p, manualVolumes: p.manualVolumes.filter(m => m.id !== id) }));

  // type="number" inputlar ustida sichqoncha g'ildiragi bilan scroll qilinganda
  // qiymat beixtiyor o'zgarib ketmasligi uchun: fokusni olib tashlaymiz.
  const noWheel = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

  const addCustomUnit = () => {
    const u = newPlaceUnit.trim();
    if (!u || allPlaceUnits.includes(u)) return;
    setCustomPlaceUnits(prev => [...prev, u]);
    setNewPlaceUnit("");
  };

  // ── File handler ───────────────────────────────────────
  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const results = await Promise.allSettled(files.map(readAttachmentFile));
    const ok = results.filter((r): r is PromiseFulfilledResult<KirimAttachment> => r.status === "fulfilled").map(r => r.value);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (ok.length) setAttachments(prev => [...prev, ...ok]);
    for (const f of failed) toast.error(f.reason?.message || "Fayl o'qib bo'lmadi");
  };

  // ── Validation ─────────────────────────────────────────
  // MUHIM: backend clientCode/clientName/clientPhone'ni MAJBURIY talab qiladi
  // (bo'sh bo'lsa 400 xato). Ilgari UI "ixtiyoriy" deb ko'rsatar va tekshirmas edi —
  // mijozsiz kirim saqlash doim oxirgi bosqichda yiqilardi.
  const validateStep1 = () => !!date && !!clientCode.trim() && !!clientName.trim();
  const validateStep2 = () => !!taskDescription.trim();
  const validateProduct = (product: KirimProduct): string | null => {
    if (!product.measurements.some(m => m.value.trim().length > 0))
      return "Tovar haqida — matn kiriting";
    if (!product.places.some(p => parseFloat(p.count) > 0 && p.unit))
      return "Joylar soni — soni kiriting";
    if (!product.quantity || parseFloat(product.quantity) <= 0)
      return "Tovar sonini kiriting";
    if (!product.brutto || parseFloat(product.brutto) <= 0)
      return "Brutto og'irligini kiriting (majburiy)";
    return null;
  };

  // ── Edit completed product ─────────────────────────────
  const handleEditCompleted = (productId: string) => {
    const product = completedProducts.find(p => p.id === productId);
    if (!product) return;
    setCompletedProducts(prev => prev.filter(p => p.id !== productId));
    setCur(product);
    setExpandedProductId(null);
    toast("Tahrirlash uchun yuklandi");
  };

  const handleDeleteCompleted = (productId: string) => {
    setCompletedProducts(prev => prev.filter(p => p.id !== productId));
    if (expandedProductId === productId) setExpandedProductId(null);
  };

  // ── Add product to list ────────────────────────────────
  const handleAddProduct = () => {
    const err = validateProduct(cur);
    if (err) { toast.error(err); return; }
    setCompletedProducts(prev => [...prev, { ...cur, totalVolume: volume }]);
    setCur(makeProduct());
    toast.success(`Tovar ${completedProducts.length + 1} qo'shildi`);
  };

  // Topshiriqlar allaqachon yuborilganini eslab qoladi — kirim saqlashda xato
  // bo'lib QAYTA urinishda hodimlarga topshiriq DUBLIKAT yuborilmasligi uchun.
  const tasksSentRef = useRef<{ taskApiId?: string } | null>(null);

  // ── Save all ───────────────────────────────────────────
  const handleSave = async () => {
    // Joriy (tugallanmagan) tovar formasi: BIRON ma'lumot kiritilgan bo'lsa —
    // validatsiyadan o'tishi shart. Ilgari faqat brutto tekshirilar edi: brutto
    // kiritilmagan tovar hech qanday ogohlantirishsiz JIMGINA tashlab yuborilardi.
    const curHasAnyData = !!(
      cur.measurements.some(m => m.value.trim()) ||
      cur.places.some(pl => parseFloat(pl.count) > 0) ||
      (cur.quantity && parseFloat(cur.quantity) > 0) ||
      (cur.brutto && parseFloat(cur.brutto) > 0) ||
      (cur.netto && parseFloat(cur.netto) > 0) ||
      cur.note.trim()
    );
    let allProducts = [...completedProducts];

    if (curHasAnyData) {
      const err = validateProduct(cur);
      if (err) { toast.error("Joriy tovar: " + err); return; }
      allProducts = [...allProducts, { ...cur, totalVolume: volume }];
    }

    if (allProducts.length === 0) {
      toast.error("Kamida bitta tovar ma'lumotlarini to'ldiring");
      return;
    }

    // MUHIM: mijoz maydonlari backendda majburiy — topshiriq yuborishdan OLDIN
    // tekshiriladi (aks holda topshiriqlar ketib bo'lgach kirim 400 bilan yiqiladi).
    if (!clientCode.trim() || !clientName.trim()) {
      toast.error(!clientCode.trim() ? "Mijoz ID raqamini kiriting (1-bosqich)" : "Mijoz topilmadi — 1-bosqichda to'g'ri ID kiriting");
      setStep(1);
      return;
    }

    setSaving(true);
    try {
      // Create API task(s) if employee + task description provided.
      // Qayta urinishda (retry) qayta YUBORILMAYDI — tasksSentRef tekshiriladi.
      let taskApiId: string | undefined = tasksSentRef.current?.taskApiId;
      if (selectedEmployeeId && taskDescription.trim() && !tasksSentRef.current) {
        try {
          if (selectedEmployeeId === "ALL") {
            // Send task to every active employee
            const results = await Promise.allSettled(
              employees.map(emp =>
                API.createTask({
                  title: taskDescription.slice(0, 100),
                  description: taskDescription,
                  assignedTo: emp.id,
                  notifyAt,
                  startDate: date,
                  endDate: deadline,
                })
              )
            );
            const failed = results.filter(r => r.status === "rejected").length;
            if (failed > 0) {
              toast.warning(`${employees.length - failed} ta hodimga yuborildi, ${failed} ta xatolik`);
            } else {
              toast.success(`Topshiriq barcha ${employees.length} ta hodimga yuborildi`);
            }
            tasksSentRef.current = {};
          } else {
            const result = await API.createTask({
              title: taskDescription.slice(0, 100),
              description: taskDescription,
              assignedTo: selectedEmployeeId,
              notifyAt,
              startDate: date,
              endDate: deadline,
            }) as any;
            taskApiId = result?.id || result?.templateId;
            tasksSentRef.current = { taskApiId };
            toast.success("Topshiriq hodimga yuborildi");
          }
        } catch (err: any) {
          toast.warning("Topshiriq yuborishda xatolik: " + err.message);
        }
      }

      const empName = selectedEmployeeId === "ALL"
        ? "Barcha hodimlar"
        : selectedEmployeeId
          ? (employees.find(e => e.id === selectedEmployeeId)?.name ?? assignedEmployee)
          : assignedEmployee;

      await addKirimRecord({
        warehouseId,
        date,
        clientCode: clientCode.toUpperCase().trim(),
        clientName,
        // Backend telefon maydonini ham majburiy talab qiladi — telefoni yo'q
        // mijozlar uchun "—" yuboriladi (aks holda kirim saqlab bo'lmas edi).
        clientPhone: clientPhone.trim() || "—",
        taskDescription,
        assignedEmployeeName: empName,
        assignedEmployeeId: (selectedEmployeeId && selectedEmployeeId !== "ALL") ? selectedEmployeeId : undefined,
        taskDeadline: deadline || undefined,
        taskNotifyAt: notifyAt || undefined,
        taskNote,
        attachments,
        taskStatus: "pending",
        taskApiId,
        products: allProducts,
      });
      toast.success("Kirim muvaffaqiyatli saqlandi");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  // ── Step navigation ────────────────────────────────────
  const goNext = () => {
    if (step === 1 && !validateStep1()) {
      toast.error(!date
        ? "Sanani kiriting"
        : !clientCode.trim()
          ? "Mijoz ID raqamini kiriting"
          : "Mijoz topilmadi — to'g'ri ID kiriting");
      return;
    }
    if (step === 2 && !validateStep2()) { toast.error("Topshiriq mazmunini kiriting"); return; }
    if (step < 3) setStep(s => s + 1);
  };
  const goBack = () => {
    if (step === 1) { onClose(); return; }
    setStep(s => s - 1);
  };

  // ══════════════════════════════════════════════════════
  // ── Step 1 render ─────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
          Sana <span className="text-destructive">*</span>
        </label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
          Mijoz ID raqami <span className="text-destructive">*</span>
        </label>
        <div className="flex gap-2">
          <input
            value={clientCode}
            onChange={e => setClientCode(e.target.value)}
            onBlur={e => lookupClient(e.target.value)}
            placeholder="OK/8001"
            className="flex-1 px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
          <button
            onClick={() => lookupClient(clientCode)}
            className="px-4 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
          >
            Qidirish
          </button>
        </div>
        {clientError && (
          <p className="text-xs text-destructive mt-1.5">{clientError}</p>
        )}
        {clientName && (
          <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-black text-blue-700 dark:text-blue-300">{clientName}</p>
              <p className="text-xs text-blue-500">{clientPhone}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Step 2 render ─────────────────────────────────────
  const renderStep2 = () => (
    <div className="space-y-5">

      {/* Task description */}
      <div>
        <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
          Topshiriq mazmuni <span className="text-destructive">*</span>
        </label>
        <textarea
          autoFocus
          value={taskDescription}
          onChange={e => setTaskDescription(e.target.value)}
          placeholder="Nima qilish kerak..."
          rows={4}
          className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none"
        />
      </div>

      {/* Employee selector */}
      <div>
        <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
          <User className="w-3 h-3 inline mr-1" />
          Mas'ul hodim
        </label>
        {employees.length > 0 ? (
          <select
            value={selectedEmployeeId}
            onChange={e => {
              setSelectedEmployeeId(e.target.value);
              const emp = employees.find(emp => emp.id === e.target.value);
              if (emp) setAssignedEmployee(emp.name);
              else setAssignedEmployee("");
            }}
            className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          >
            <option value="">— Hodim tanlang —</option>
            <option value="ALL">Barcha hodimlar ({employees.length} ta)</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        ) : (
          <input
            value={assignedEmployee}
            onChange={e => setAssignedEmployee(e.target.value)}
            placeholder="Hodim ismi..."
            className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        )}
        {selectedEmployeeId === "ALL" && (
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1.5 flex items-center gap-1.5 font-semibold">
            <Users className="w-3.5 h-3.5" />
            Barcha {employees.length} ta hodimga yuboriladi
          </p>
        )}
        {selectedEmployeeId && selectedEmployeeId !== "ALL" && (
          <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1.5 font-semibold">
            <User className="w-3.5 h-3.5" />
            Topshiriq tizimi orqali yuboriladi
          </p>
        )}
      </div>

      {/* Deadline + NotifyAt row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
            <Calendar className="w-3 h-3 inline mr-1" />
            Muddat
          </label>
          <input
            type="date"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            min={date}
            className="w-full px-3 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
            <Clock className="w-3 h-3 inline mr-1" />
            Eslatma vaqti
          </label>
          <input
            type="time"
            value={notifyAt}
            onChange={e => setNotifyAt(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Hint when employee selected */}
      {selectedEmployeeId === "ALL" && (
        <div className="flex items-start gap-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl px-4 py-3">
          <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
          <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium leading-relaxed">
            Saqlanganda <span className="font-bold">barcha {employees.length} ta hodimga</span> alohida topshiriq yuboriladi. Har bir hodim "Topshiriqlar" bo'limida ko'radi va bajaradi.
          </p>
        </div>
      )}
      {selectedEmployeeId && selectedEmployeeId !== "ALL" && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium leading-relaxed">
            Saqlanganda hodimga topshiriq avtomatik yuboriladi. Hodim "Topshiriqlar" bo'limida uni ko'rib, qabul qilishi va bajarilgandan so'ng hisobot yuborishi mumkin.
          </p>
        </div>
      )}

      {/* Note */}
      <div>
        <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
          Izoh
        </label>
        <textarea
          value={taskNote}
          onChange={e => setTaskNote(e.target.value)}
          placeholder="Qo'shimcha ma'lumot..."
          rows={2}
          className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none"
        />
      </div>

      {/* Attachments */}
      <div>
        <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
          Hujjatlar <span className="text-muted-foreground/60 normal-case font-normal">(xlsx, doc, pdf, rasm)</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer w-full px-4 py-3 rounded-xl border-2 border-dashed border-border hover:border-blue-400 text-sm text-muted-foreground hover:text-blue-600 transition-colors">
          <Upload className="w-4 h-4 shrink-0" />
          <span>Fayl tanlash...</span>
          <input type="file" multiple accept=".xlsx,.xls,.doc,.docx,.pdf,.png,.jpg,.jpeg,.webp,.gif,image/*" onChange={handleFiles} className="hidden" />
        </label>
        {attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {attachments.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-secondary/60 rounded-lg px-3 py-1.5">
                {f.type?.startsWith("image/") && f.dataUrl ? (
                  <img
                    src={f.dataUrl}
                    alt={f.name}
                    onClick={() => window.open(f.dataUrl, "_blank")}
                    className="w-8 h-8 rounded object-cover border border-border shrink-0 cursor-pointer hover:opacity-90"
                  />
                ) : null}
                <span className="font-medium truncate flex-1">{f.name}</span>
                <span className="text-muted-foreground/50 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                <button onClick={() => setAttachments(p => p.filter((_, j) => j !== i))} className="text-destructive/70 hover:text-destructive shrink-0">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── Step 3 render – all product fields at once ─────────
  const renderStep3 = () => (
    <div className="space-y-5">

      {/* Added products summary – expandable */}
      {completedProducts.length > 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
          <div className="bg-blue-50 dark:bg-blue-950/30 px-3 py-2 border-b border-blue-200 dark:border-blue-800">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">
              Qo'shilgan tovarlar ({completedProducts.length} ta)
            </p>
          </div>
          <div className="divide-y divide-blue-100 dark:divide-blue-900/40">
            {completedProducts.map((p, i) => {
              const isOpen = expandedProductId === p.id;
              const vol = calcVolume(p);
              return (
                <div key={p.id} className="bg-white dark:bg-card">
                  {/* Row header */}
                  <button
                    type="button"
                    onClick={() => setExpandedProductId(isOpen ? null : p.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-blue-50/60 dark:hover:bg-blue-950/20 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-black text-blue-600">{i + 1}</span>
                    </div>
                    <span className="flex-1 text-xs font-medium text-foreground truncate">
                      {p.measurements.filter(m => m.value).map(m => m.value).join(", ") || "Tovar"}
                      {p.brutto && ` · ${p.brutto} ${p.bruttoUnit}`}
                    </span>
                    {isOpen
                      ? <ChevronUp className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    }
                  </button>

                  {/* Expanded details */}
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 bg-blue-50/40 dark:bg-blue-950/10 space-y-2 border-t border-blue-100 dark:border-blue-900/40">
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        {p.measurements.filter(m => m.value).length > 0 && (
                          <div className="col-span-2 bg-white dark:bg-card rounded-lg px-3 py-2 border border-blue-100">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Tovar haqida</p>
                            <p className="font-medium text-foreground">{p.measurements.filter(m => m.value).map(m => m.value).join(", ")}</p>
                          </div>
                        )}
                        {p.places.filter(pl => pl.count).length > 0 && (
                          <div className="bg-white dark:bg-card rounded-lg px-3 py-2 border border-blue-100">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Joylar</p>
                            <p className="font-medium text-foreground">{p.places.filter(pl => pl.count).map(pl => `${pl.count} ${pl.unit}`).join(", ")}</p>
                          </div>
                        )}
                        {p.quantity && (
                          <div className="bg-white dark:bg-card rounded-lg px-3 py-2 border border-blue-100">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Tovar soni</p>
                            <p className="font-medium text-foreground">{p.quantity}</p>
                          </div>
                        )}
                        {p.brutto && (
                          <div className="bg-white dark:bg-card rounded-lg px-3 py-2 border border-blue-100">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Brutto</p>
                            <p className="font-medium text-foreground">{p.brutto} {p.bruttoUnit}</p>
                          </div>
                        )}
                        {p.netto && (
                          <div className="bg-white dark:bg-card rounded-lg px-3 py-2 border border-blue-100">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Netto</p>
                            <p className="font-medium text-foreground">{p.netto} {p.nettoUnit}</p>
                          </div>
                        )}
                        {(p.width || p.length || p.height) && (
                          <div className="bg-white dark:bg-card rounded-lg px-3 py-2 border border-blue-100">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">O'lchamlar</p>
                            <p className="font-medium text-foreground">{p.width}×{p.length}×{p.height} {p.dimensionUnit}</p>
                          </div>
                        )}
                        {vol && (
                          <div className="bg-white dark:bg-card rounded-lg px-3 py-2 border border-blue-100">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Jami hajmi</p>
                            <p className="font-bold text-blue-600">{vol}</p>
                          </div>
                        )}
                        {p.note && (
                          <div className="col-span-2 bg-white dark:bg-card rounded-lg px-3 py-2 border border-blue-100">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Izoh</p>
                            <p className="font-medium text-foreground">{p.note}</p>
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleEditCompleted(p.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Tahrirlash
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCompleted(p.id)}
                          className="px-3 py-2 rounded-xl border border-destructive/30 text-destructive text-xs font-bold hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Current product form header */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-black text-white">{completedProducts.length + 1}</span>
        </div>
        <span className="text-sm font-black text-foreground">Tovar {completedProducts.length + 1}</span>
      </div>

      {/* ── Section 1: Tovar haqida ── */}
      <div className="bg-secondary/30 rounded-2xl border border-border/60 p-4">
        <SectionLabel icon={Package} title="Tovar haqida" />
        <div className="space-y-2">
          {cur.measurements.map((m) => (
            <div key={m.id} className="flex gap-2 items-center">
              <input
                type="text"
                value={m.value}
                onChange={e => updM(m.id, "value", e.target.value)}
                placeholder="Tovar nomi yoki tavsifi..."
                className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <button onClick={() => delM(m.id)} disabled={cur.measurements.length <= 1}
                className="p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button onClick={addM} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 mt-1">
            <Plus className="w-3.5 h-3.5" /> O'lchov qo'shish
          </button>
        </div>
      </div>

      {/* ── Section 2: Joylar soni ── */}
      <div className="bg-secondary/30 rounded-2xl border border-border/60 p-4">
        <SectionLabel icon={MapPin} title="Joylar soni" required />
        <div className="space-y-2">
          {cur.places.map((p) => (
            <div key={p.id} className="flex gap-2 items-center">
              <input
                type="number" min="0" step="any" onWheel={noWheel}
                value={p.count}
                onChange={e => updP(p.id, "count", e.target.value)}
                placeholder="Soni"
                className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <select
                value={p.unit}
                onChange={e => updP(p.id, "unit", e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {allPlaceUnits.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button onClick={() => delP(p.id)} disabled={cur.places.length <= 1}
                className="p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button onClick={addP} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700">
            <Plus className="w-3.5 h-3.5" /> Joy qo'shish
          </button>
          <div className="flex gap-2 pt-2 border-t border-border/50 mt-2">
            <input
              value={newPlaceUnit}
              onChange={e => setNewPlaceUnit(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCustomUnit()}
              placeholder="Yangi birlik (vagon, fura...)"
              className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <button onClick={addCustomUnit}
              className="px-3 py-2 rounded-xl bg-secondary text-sm font-bold hover:bg-secondary/80 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {customPlaceUnits.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {customPlaceUnits.map(u => (
                <span key={u} className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 px-2 py-0.5 rounded-full font-bold">{u}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3: Tovar soni ── */}
      <div className="bg-secondary/30 rounded-2xl border border-border/60 p-4">
        <SectionLabel icon={LayoutList} title="Tovar soni" required />
        <input
          type="number" min="0" step="any" onWheel={noWheel}
          value={cur.quantity}
          onChange={e => upd({ quantity: e.target.value })}
          placeholder="0"
          className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>

      {/* ── Section 4: O'lchamlari + Jami hajmi ── */}
      <div className="bg-secondary/30 rounded-2xl border border-border/60 p-4">
        <SectionLabel icon={Ruler} title="O'lchamlari" />

        {/* Hisoblash usuli */}
        <div className="flex gap-1.5 mb-3">
          {([
            { key: "places", label: "Joy soni bo'yicha" },
            { key: "quantity", label: "Tovar soni bo'yicha" },
            { key: "manual", label: "Qo'lda kiritish" },
          ] as const).map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => upd({ volumeMode: opt.key })}
              className={`flex-1 px-1.5 py-2 rounded-xl text-[10.5px] font-bold leading-tight transition-colors border ${
                cur.volumeMode === opt.key
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-background text-muted-foreground border-input hover:border-blue-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {cur.volumeMode === "manual" ? (
          <>
            {/* Qo'lda kiritiladigan hajmlar ro'yxati */}
            <div className="space-y-2 mb-3">
              {cur.manualVolumes.map(mv => (
                <div key={mv.id} className="flex gap-2 items-center">
                  <input
                    type="number" min="0" step="any" onWheel={noWheel}
                    value={mv.value}
                    onChange={e => updMV(mv.id, e.target.value)}
                    placeholder="Hajm"
                    className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <span className="text-xs font-bold text-muted-foreground shrink-0">m³</span>
                  <button onClick={() => delMV(mv.id)} disabled={cur.manualVolumes.length <= 1}
                    className="p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={addMV} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700">
                <Plus className="w-3.5 h-3.5" /> Yana o'lcham qo'shish
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2 mb-3">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground mb-1 block">O'lchov birligi</label>
                <select
                  value={cur.dimensionUnit}
                  onChange={e => upd({ dimensionUnit: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {DIMENSION_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Eni", field: "width" as const },
                  { label: "Uzunligi", field: "length" as const },
                  { label: "Balandligi", field: "height" as const },
                ].map(({ label, field }) => (
                  <div key={field}>
                    <label className="text-[10px] font-bold text-muted-foreground mb-1 block">{label}</label>
                    <input
                      type="number" min="0" step="any" onWheel={noWheel}
                      value={cur[field]}
                      onChange={e => upd({ [field]: e.target.value })}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-2 rounded-xl border bg-secondary/50 border-border/50 mb-1.5">
              <span className="text-[11px] font-bold text-muted-foreground">Bitta birlik hajmi</span>
              <span className="text-xs font-black text-foreground">
                {unitCube ? formatM3(unitCube) : "—"}
              </span>
            </div>
          </>
        )}

        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${
          volume
            ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
            : "bg-secondary/50 border-border/50"
        }`}>
          <span className="text-xs font-bold text-muted-foreground">
            Jami hajmi
            {cur.volumeMode !== "manual" && (
              <span className="text-muted-foreground/60 font-normal normal-case ml-1">
                ({cur.volumeMode === "quantity" ? "tovar soniga" : "joy soniga"} ko'paytirilgan)
              </span>
            )}
          </span>
          <span className={`text-sm font-black ${volume ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground/40"}`}>
            {volume || "—"}
          </span>
        </div>
      </div>

      {/* ── Section 5: Og'irlik ── */}
      <div className="bg-secondary/30 rounded-2xl border border-border/60 p-4">
        <SectionLabel icon={Weight} title="Og'irlik" required />
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-muted-foreground mb-1 block">
              Brutto <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number" min="0" step="any" onWheel={noWheel}
                value={cur.brutto}
                onChange={e => upd({ brutto: e.target.value })}
                placeholder="0"
                className="flex-1 px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <select
                value={cur.bruttoUnit}
                onChange={e => upd({ bruttoUnit: e.target.value })}
                className="w-20 px-2 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {WEIGHT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground mb-1 block">Netto</label>
            <div className="flex gap-2">
              <input
                type="number" min="0" step="any" onWheel={noWheel}
                value={cur.netto}
                onChange={e => upd({ netto: e.target.value })}
                placeholder="0"
                className="flex-1 px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <select
                value={cur.nettoUnit}
                onChange={e => upd({ nettoUnit: e.target.value })}
                className="w-20 px-2 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {WEIGHT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 6: Izoh ── */}
      <div className="bg-secondary/30 rounded-2xl border border-border/60 p-4">
        <SectionLabel icon={MessageSquare} title="Izoh" />
        <textarea
          value={cur.note}
          onChange={e => upd({ note: e.target.value })}
          placeholder="Tovar haqida qo'shimcha ma'lumot..."
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
        />
      </div>

    </div>
  );

  // ══════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-60 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <ArrowDownCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-foreground">
                {STEPS[step - 1].label}
              </h2>
              <p className="text-[11px] text-muted-foreground">Bosqich {step} / 3</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-5 pt-3 pb-1 shrink-0">
          <div className="flex gap-1.5">
            {STEPS.map(s => (
              <div key={s.id} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                s.id < step ? "bg-blue-600" :
                s.id === step ? "bg-blue-400" :
                "bg-secondary"
              }`} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>

        {/* Footer */}
        <div className={`px-5 py-4 border-t border-border shrink-0 ${step === 3 ? "space-y-2" : ""}`}>
          {step === 3 ? (
            <>
              <div className="flex gap-2">
                <button onClick={goBack}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleAddProduct}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-blue-600 text-blue-600 font-black text-sm hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Tovar qo'shish
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-black text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
              {completedProducts.length > 0 && (
                <p className="text-[10px] text-center text-muted-foreground">
                  «Saqlash» — joriy tovarni ham qo'shib saqlaydi
                </p>
              )}
            </>
          ) : (
            <div className="flex gap-3">
              <button onClick={goBack}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" />
                {step === 1 ? "Bekor" : "Orqaga"}
              </button>
              <button onClick={goNext}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white font-black text-sm hover:bg-blue-700 transition-colors">
                Keyingisi <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
