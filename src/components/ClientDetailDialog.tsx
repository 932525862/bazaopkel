import { useState, useEffect, useMemo, useRef } from "react";
import { getStoredClientIds, storeClientId } from "@/lib/client-ids";
import { useSession } from "@/lib/store";
import { X, Phone, MessageSquare, Bell, Trash2, ShoppingCart, CheckCircle2, AlertCircle, Pencil, Check, ChevronRight, Plus, Image, FileText } from "lucide-react";
import type { Client, AppState, SaleInfo, ClientStage } from "@/lib/types";
import { toast } from "sonner";
import { API } from "@/lib/api/client";
import { ConfirmModal } from "@/components/ConfirmModal";
import { formatUzDateTime, formatUzDate, getTashkentDayjs, tashkentInputToIso } from "@/lib/date-utils";
import { TelegramUserSingleSelect } from "@/components/TelegramUserSingleSelect";
import { TelegramMessageModal } from "@/components/TelegramMessageModal";
import { ReminderModal } from "@/components/ReminderModal";

const STAGE_LABELS: Record<ClientStage, string> = {
  new: "Yangi",
  no_answer: "Ko'tarmadi",
  talked: "Gaplashildi",
  sold: "Sotildi",
};

const INFO_TEXT_PREFIX = "[MALUMOT]: ";
const INFO_IMAGE_PREFIX = "[RASM]: ";

const convertImageToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW = 600;
      const ratio = Math.min(1, maxW / img.width);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.65));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Rasmni yuklashda xatolik"));
    };
    img.src = url;
  });

interface Props {
  client: Client;
  state: AppState;
  onClose: () => void;
  onRefresh: () => void;
  viewerRole: "director" | "employee";
  viewerName: string;
  viewerId?: string;
  enableCallActions?: boolean;
  readOnly?: boolean;
}

export function ClientDetailDialog({
  client,
  state,
  onClose,
  onRefresh,
  viewerRole,
  viewerName,
  viewerId,
  readOnly = false,
}: Props) {
  const session = useSession();
  const [localClient, setLocalClient] = useState<Client>(client);

  const attachedTelegramIds = useMemo(() => {
    if (!state.clients) return [];
    return state.clients
      .filter((c: Client) => c.telegramId && c.id !== client.id)
      .map((c: Client) => String(c.telegramId));
  }, [state.clients, client.id]);

  const infoNotes = useMemo(
    () => (localClient.notes || []).filter(
      n => n.text.startsWith(INFO_TEXT_PREFIX) || n.text.startsWith(INFO_IMAGE_PREFIX)
    ),
    [localClient.notes]
  );
  const regularNotes = useMemo(
    () => (localClient.notes || []).filter(
      n => !n.text.startsWith(INFO_TEXT_PREFIX) && !n.text.startsWith(INFO_IMAGE_PREFIX)
    ),
    [localClient.notes]
  );

  useEffect(() => {
    setLocalClient(client);
  }, [client]);

  useEffect(() => {
    // Asosiy manba — serverdagi client.clientCode; localStorage faqat zaxira kesh
    setAssignedCode(client.clientCode || getStoredClientIds()[client.id]);
  }, [client.id, client.clientCode]);

  useEffect(() => {
    setNoteText("");
    setMoveStage(client.stage);
    setCallNote("");
    setCallReminder("");
    setShowPurchase(false);
    setPurchaseMode("choose");
    setFullBase("");
    setFullAdditional("");
    setPartialBase("");
    setPartialAdditional("");
    setPartialPaid("");
    setPartialNextDate("");
    setExtraAmount("");
    setLeaseWarningTelegramId(null);
    setSingleTelegramId(null);
    setPaymentToDelete(null);
    setShowAddInfoChoice(false);
    setAddInfoType(null);
    setInfoText("");
    setSelectedImages([]);
    setImagePreviewUrls([]);
  }, [client.id]);

  const formatPrice = (val: string) => {
    if (!val) return "";
    return val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  const parsePrice = (val: string) => val.replace(/\D/g, "");

  const [noteText, setNoteText] = useState("");
  const [moveStage, setMoveStage] = useState<ClientStage>(client.stage);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResellConfirm, setShowResellConfirm] = useState(false);
  const [showSaleFlow, setShowSaleFlow] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [callNote, setCallNote] = useState("");
  const [callReminder, setCallReminder] = useState("");
  const [showFullPaymentConfirm, setShowFullPaymentConfirm] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [singleTelegramId, setSingleTelegramId] = useState<string | null>(null);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showTalkedReminderModal, setShowTalkedReminderModal] = useState(false);
  const [leaseWarningTelegramId, setLeaseWarningTelegramId] = useState<string | null>(null);

  // Sale state
  const sale: SaleInfo = localClient.sale ?? { status: "none", payments: [] };
  const totalPaid = sale.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = sale.totalAmount ? Math.max(0, sale.totalAmount - totalPaid) : 0;

  const [showPurchase, setShowPurchase] = useState(false);
  const [purchaseMode, setPurchaseMode] = useState<"choose" | "full" | "partial">("choose");
  const [fullBase, setFullBase] = useState("");
  const [fullAdditional, setFullAdditional] = useState("");
  const [partialBase, setPartialBase] = useState("");
  const [partialAdditional, setPartialAdditional] = useState("");
  const [partialPaid, setPartialPaid] = useState("");
  const [partialNextDate, setPartialNextDate] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [assignedCode, setAssignedCode] = useState<string | undefined>(
    () => client.clientCode || getStoredClientIds()[client.id]
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editedName, setEditedName] = useState(client.name || "");
  const [editedPhone, setEditedPhone] = useState(client.phone || "");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(client.description || "");

  // Add-info feature
  const [showAddInfoChoice, setShowAddInfoChoice] = useState(false);
  const [addInfoType, setAddInfoType] = useState<"image" | "text" | null>(null);
  const [infoText, setInfoText] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleAddNote = async () => {
    if (!noteText.trim() || readOnly) return;
    setLoading(true);
    try {
      await API.addNote(localClient.id, noteText.trim());
      setNoteText("");
      toast.success("Izoh qo'shildi");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDetails = async (field: "name" | "phone" | "description") => {
    let val = "";
    if (field === "name") val = editedName;
    else if (field === "phone") val = editedPhone;
    else if (field === "description") val = editedDescription;

    if (!val.trim() && field !== "description") {
      toast.error("Maydon bo'sh bo'lishi mumkin emas");
      return;
    }
    setLoading(true);
    try {
      await API.updateClient(localClient.id, { [field]: val.trim() });
      toast.success("Ma'lumotlar yangilandi");
      if (field === "name") setIsEditingName(false);
      else if (field === "phone") setIsEditingPhone(false);
      else setIsEditingDescription(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleAddInfoText = async () => {
    if (!infoText.trim()) return;
    setLoading(true);
    try {
      await API.addNote(localClient.id, `${INFO_TEXT_PREFIX}${infoText.trim()}`);
      setInfoText("");
      setAddInfoType(null);
      setShowAddInfoChoice(false);
      toast.success("Matn qo'shildi");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleImagesSelected = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    setSelectedImages(prev => {
      const combined = [...prev, ...newFiles].slice(0, 10);
      const urls = combined.map(f => URL.createObjectURL(f));
      setImagePreviewUrls(urls);
      return combined;
    });
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages(prev => {
      const next = prev.filter((_, i) => i !== index);
      const urls = next.map(f => URL.createObjectURL(f));
      setImagePreviewUrls(urls);
      return next;
    });
  };

  const handleUploadImages = async () => {
    if (selectedImages.length === 0) return;
    setImageUploading(true);
    try {
      for (const file of selectedImages) {
        const b64 = await convertImageToBase64(file);
        await API.addNote(localClient.id, `${INFO_IMAGE_PREFIX}${b64}`);
      }
      setSelectedImages([]);
      setImagePreviewUrls([]);
      setAddInfoType(null);
      setShowAddInfoChoice(false);
      toast.success("Rasmlar saqlandi");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Rasmlarni saqlashda xatolik");
    } finally {
      setImageUploading(false);
    }
  };

  const handleMoveStage = async () => {
    if (moveStage === localClient.stage) return;
    setLoading(true);
    try {
      await API.updateClient(localClient.id, { stage: moveStage });
      toast.success(`"${STAGE_LABELS[moveStage]}" bosqichiga ko'chirildi`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleFullPurchase = async () => {
    const baseAmt = parseFloat(fullBase || "0");
    const addAmt = parseFloat(fullAdditional || "0");
    const total = baseAmt + addAmt;
    if (total <= 0) {
      toast.error("To'lov summasini kiriting");
      return;
    }
    setLoading(true);
    try {
      await API.setSale(localClient.id, {
        status: "full",
        totalAmount: total,
        paidAmount: total,
        additionalPrice: addAmt
      });
      await API.updateClient(localClient.id, { stage: "sold" });
      setLocalClient(prev => ({ ...prev, stage: "sold" }));
      toast.success("Sotildi (to'liq)");
      setShowPurchase(false);
      setShowSaleFlow(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handlePartialPurchase = async () => {
    const baseAmt = parseFloat(partialBase || "0");
    const addAmt = parseFloat(partialAdditional || "0");
    const total = baseAmt + addAmt;
    const paid = parseFloat(partialPaid || "0");


    if (total <= 0 || paid <= 0) {
      toast.error("To'liq summa va to'langan summani kiriting");
      return;
    }
    if (paid >= total) {
      toast.error("To'langan summa to'liq summadan kichik bo'lishi kerak");
      return;
    }
    if (!partialNextDate) {
      toast.error("Keyingi to'lov sanasini kiriting");
      return;
    }
    if (!leaseWarningTelegramId) {
      toast.error("Ogohlantirish yuborish uchun telegram foydalanuvchisini tanlang");
      return;
    }
    setLoading(true);
    try {
      await API.setSale(localClient.id, {
        status: "partial",
        totalAmount: total,
        paidAmount: paid,
        additionalPrice: addAmt,
        nextPaymentAt: tashkentInputToIso(partialNextDate),
        telegramId: leaseWarningTelegramId
      });
      await API.updateClient(localClient.id, { stage: "sold" });
      setLocalClient(prev => ({ ...prev, stage: "sold" }));
      toast.success("Sotildi (bir qismi)");
      setShowPurchase(false);
      setShowSaleFlow(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPayment = async () => {
    const amt = parseFloat(extraAmount);
    if (!amt || amt <= 0) {
      toast.error("Summa kiriting");
      return;
    }
    setLoading(true);
    try {
      await API.addPayment(localClient.id, amt);
      setExtraAmount("");
      toast.success("To'lov qo'shildi");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!paymentToDelete) return;
    setLoading(true);
    try {
      await API.deletePayment(paymentToDelete);
      toast.success("To'lov o'chirildi");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
      setPaymentToDelete(null);
    }
  };

  const handleCompletePayment = async () => {
    setLoading(true);
    try {
      if (remaining > 0) {
        await API.addPayment(localClient.id, remaining);
      }
      await API.setSale(localClient.id, { status: "full" });
      toast.success("To'lov yakunlandi");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await API.deleteClient(localClient.id);
      toast.success("Mijoz o'chirildi");
      onRefresh();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleResell = async () => {
    // Duplicate the current (sold) client as a new lead so the original sale history remains intact.
    setLoading(true);
    try {
      // Create a new client with the same basic info in the same category/department
      const created = await API.createClient({
        name: localClient.name,
        phone: localClient.phone,
        categoryId: localClient.categoryId,
        description: `Qayta sotish: nusxa (manba mijoz id: ${localClient.id})`
      });

      // Ensure the new client is in the 'new' stage
      try {
        await API.updateClient(created.id || created._id || created.clientId || String((created as any).id), { stage: "new" });
      } catch (e) {
        // ignore stage update failure — creation still provides a new lead
      }

      // Add a note to the original sold client preserving sale summary
      const saleSummaryParts: string[] = [];
      if (localClient.sale) {
        saleSummaryParts.push(`Old sale status: ${localClient.sale.status}`);
        if (localClient.sale.totalAmount) saleSummaryParts.push(`Total: ${localClient.sale.totalAmount}`);
        if (localClient.sale.soldAt) saleSummaryParts.push(`Sold at: ${localClient.sale.soldAt}`);
        if (localClient.sale.payments && localClient.sale.payments.length > 0) {
          saleSummaryParts.push(`Payments: ${localClient.sale.payments.map(p => `${p.amount}@${p.createdAt}`).join('; ')}`);
        }
      }
      saleSummaryParts.push(`New lead created: id=${(created as any).id || (created as any)._id || ''}`);
      await API.addNote(localClient.id, `Qayta sotish amalga oshirildi. ${saleSummaryParts.join(' | ')}`);

      toast.success("Qayta sotish uchun yangi lid yaratildi");
      setShowResellConfirm(false);
      onRefresh();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Qayta sotish bajarilmadi");
    } finally {
      setLoading(false);
    }
  };

  const handleStartCall = async () => {
    setLoading(true);
    try {
      await API.callStart(localClient.id);
      toast.success("Mijoz sizga biriktirildi, qo'ng'iroq jarayonida");

      // Immediate UI update
      setLocalClient(prev => ({
        ...prev,
        call: {
          ...prev.call,
          inCallByEmployeeId: viewerId,
          inCallByName: viewerName,
          callStartedAt: new Date().toISOString()
        }
      }));

      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleAssignId = async () => {
    setLoading(true);
    try {
      if (callNote.trim()) {
        await API.addNote(localClient.id, callNote.trim());
        setCallNote("");
      }
      // Kod serverda ATOMIK va yagona tarzda beriladi (qurilmalararo to'qnashuvsiz)
      const updated = await API.assignClientCode(localClient.id);
      const nextId: string | undefined = updated?.clientCode;
      if (!nextId) {
        toast.error("Kod berib bo'lmadi");
        return;
      }
      storeClientId(localClient.id, nextId); // warehouse qidiruvi uchun zaxira kesh
      setAssignedCode(nextId);
      setLocalClient(prev => ({
        ...prev,
        clientCode: nextId,
        stage: "talked",
        call: { ...prev.call, inCallByEmployeeId: undefined, inCallByName: undefined, callStartedAt: undefined }
      }));
      toast.success(`ID berildi: ${nextId}`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteCall = async (action: ClientStage) => {
    if (action === "no_answer" && !callReminder && !showReminderModal) {
      setShowReminderModal(true);
      return;
    }
    if (action === "talked" && !callReminder && !showTalkedReminderModal) {
      setShowTalkedReminderModal(true);
      return;
    }

    setLoading(true);
    try {
      if (callNote.trim()) {
        await API.addNote(localClient.id, callNote.trim());
        setCallNote("");
      }
      const payload: any = { stage: action };
      if (callReminder) {
        payload.remindAt = tashkentInputToIso(callReminder);
        setCallReminder("");
      }

      await API.updateClient(localClient.id, payload);
      toast.success("Qo'ng'iroq yakunlandi");

      // Immediate UI update
      setLocalClient(prev => ({
        ...prev,
        stage: action,
        call: { ...prev.call, inCallByEmployeeId: undefined, inCallByName: undefined, callStartedAt: undefined }
      }));

      onRefresh();
      setShowReminderModal(false);
      setShowTalkedReminderModal(false);
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleStartSaleFlow = async () => {
    setLoading(true);
    try {
      if (callNote.trim()) {
        await API.addNote(localClient.id, callNote.trim());
        setCallNote("");
      }
      const payload: any = { stage: "talked" };
      if (callReminder) {
        payload.remindAt = tashkentInputToIso(callReminder);
        setCallReminder("");
      }
      await API.updateClient(localClient.id, payload);
      toast.success("Sotov jarayoni boshlandi");

      setLocalClient(prev => ({
        ...prev,
        stage: "talked",
        call: { ...prev.call, inCallByEmployeeId: undefined, inCallByName: undefined, callStartedAt: undefined }
      }));

      setShowSaleFlow(true);
      setShowPurchase(true);
      setPurchaseMode("choose");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (localClient.call?.inCallByEmployeeId === viewerId) {
      toast.warning("Ma'lum bir bo'limga biriktiring!");
      return;
    }
    if (showSaleFlow) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  const handleConfirmClose = async () => {
    setShowCloseConfirm(false);
    setShowSaleFlow(false);
    setShowPurchase(false);
    setPurchaseMode("choose");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate flex items-center gap-2">
              {localClient.data?.["Ism familya"] || localClient.name || "Mijoz"}
              {sale.status === "partial" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">
                  To'liq emas
                </span>
              )}
              {sale.status === "full" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success font-medium inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Sotildi
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground">Bo'lim: {localClient.formTitle || "—"}</p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">


          {/* Form data / Details */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">Mijoz ma'lumotlari</h3>
            <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
              <div className="grid grid-cols-3 gap-2 text-sm items-center min-h-[40px]">
                <span className="text-muted-foreground whitespace-nowrap">Ism familya</span>
                <div className="col-span-2 flex items-center justify-between group">
                  {isEditingName ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        autoFocus
                        value={editedName}
                        onChange={e => setEditedName(e.target.value)}
                        className="flex-1 bg-background border border-primary/20 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/10"
                      />
                      <button
                        onClick={() => handleUpdateDetails("name")}
                        disabled={loading}
                        className="p-1 rounded bg-success/10 text-success hover:bg-success/20"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-foreground font-medium truncate">{localClient.name}</span>
                      {viewerRole === "director" && !readOnly && (
                        <button
                          onClick={() => setIsEditingName(true)}
                          className="p-1.5 hover:bg-secondary rounded-lg transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm items-center min-h-[40px]">
                <span className="text-muted-foreground whitespace-nowrap">Tel raqam</span>
                <div className="col-span-2 flex items-center justify-between group">
                  {isEditingPhone ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        autoFocus
                        value={editedPhone}
                        onChange={e => setEditedPhone(e.target.value)}
                        className="flex-1 bg-background border border-primary/20 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/10"
                      />
                      <button
                        onClick={() => handleUpdateDetails("phone")}
                        disabled={loading}
                        className="p-1 rounded bg-success/10 text-success hover:bg-success/20"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-foreground font-medium truncate">{localClient.phone}</span>
                      {viewerRole === "director" && !readOnly && (
                        <button
                          onClick={() => setIsEditingPhone(true)}
                          className="p-1.5 hover:bg-secondary rounded-lg transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm items-center min-h-[40px]">
                <span className="text-muted-foreground whitespace-nowrap">Izoh</span>
                <div className="col-span-2 flex items-center justify-between group">
                  {isEditingDescription ? (
                    <div className="flex-1 flex gap-2">
                      <textarea
                        autoFocus
                        value={editedDescription}
                        onChange={e => setEditedDescription(e.target.value)}
                        className="flex-1 bg-background border border-primary/20 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/10 min-h-[60px]"
                      />
                      <button
                        onClick={() => handleUpdateDetails("description")}
                        disabled={loading}
                        className="p-1 rounded bg-success/10 text-success hover:bg-success/20 self-start mt-1"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-foreground font-medium break-words">{localClient.description || "—"}</span>
                      {viewerRole === "director" && !readOnly && (
                        <button
                          onClick={() => setIsEditingDescription(true)}
                          className="p-1.5 hover:bg-secondary rounded-lg transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {assignedCode && (
                <div className="grid grid-cols-3 gap-2 text-sm items-center min-h-[40px]">
                  <span className="text-muted-foreground whitespace-nowrap">ID</span>
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-lg font-bold text-sm tracking-wider">
                      {assignedCode}
                    </span>
                  </div>
                </div>
              )}
              {Object.entries(localClient.data || {}).map(([key, value]) => {
                if (key === "Ism familya" || key === "Tel raqam") return null;
                return (
                  <div key={key} className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="col-span-2 text-foreground font-medium break-words">{value || "—"}</span>
                  </div>
                );
              })}
            </div>
            {infoNotes.length > 0 && (
              <div className="mt-3 border-t border-border/50 pt-3 space-y-3">
                {infoNotes.map(note => {
                  if (note.text.startsWith(INFO_TEXT_PREFIX)) {
                    const content = note.text.slice(INFO_TEXT_PREFIX.length);
                    return (
                      <div key={note.id} className="rounded-lg bg-background border border-border/60 px-3 py-2 space-y-1">
                        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{content}</p>
                        <span className="text-[10px] text-muted-foreground">{formatUzDateTime(note.createdAt)}</span>
                      </div>
                    );
                  }
                  if (note.text.startsWith(INFO_IMAGE_PREFIX)) {
                    const src = note.text.slice(INFO_IMAGE_PREFIX.length);
                    return (
                      <div key={note.id} className="rounded-lg overflow-hidden border border-border/60 space-y-1">
                        <img
                          src={src}
                          alt="rasm"
                          className="w-full object-contain max-h-64 bg-secondary/30"
                        />
                        <span className="block text-[10px] text-muted-foreground px-2 pb-1.5">{formatUzDateTime(note.createdAt)}</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}
            {!readOnly && (
              <button
                onClick={() => { setShowAddInfoChoice(true); setAddInfoType(null); }}
                className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Ma'lumot qo'shish
              </button>
            )}
          </section>

          {/* Call section - show for ALL stages except Sold, unless a call is active. Hide during sale flow. Hide if readOnly. */}
          {!showSaleFlow && !readOnly && (
            <section className="rounded-xl border border-border p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Phone className="w-4 h-4" /> Qo'ng'iroq
              </h3>

              {/* If no one is calling and it's NOT sold, show the start button */}
              {!localClient.call?.inCallByEmployeeId && localClient.stage !== "sold" && (
                <button
                  onClick={handleStartCall}
                  disabled={loading || session?.isActive === false}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-black shadow-lg hover:shadow-glow transition-all"
                >
                  Qo'ng'iroq qilinyapti
                </button>
              )}

              {localClient.call?.inCallByEmployeeId && localClient.call.inCallByEmployeeId !== viewerId && (
                <div className="bg-warning/10 text-warning-foreground p-3 rounded-lg text-sm text-center">
                  Ushbu mijoz bilan xozirda <strong>{localClient.call.inCallByName || "boshqa xodim"}</strong> gaplashmoqda.
                </div>
              )}


              {localClient.call?.inCallByEmployeeId === viewerId && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Siz hozir bu mijoz bilan bog'lanmoqdasiz. Yakunlang:</p>
                  <textarea
                    value={callNote}
                    onChange={(e) => setCallNote(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm min-h-[80px]"
                    placeholder="Ertaga o'ylab ko'raman dedi..."
                  />
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleCompleteCall("talked")} className="flex-[2] min-w-[110px] py-2.5 bg-secondary text-foreground rounded-lg text-sm font-medium transition-colors hover:bg-[#0F172A] hover:text-white">Gaplashildi</button>
                    <button onClick={() => handleCompleteCall("no_answer")} className="flex-[1.5] min-w-[100px] py-2.5 bg-secondary text-foreground rounded-lg text-sm font-medium transition-colors hover:bg-[#0F172A] hover:text-white">Ko'tarmadi</button>
                    {!assignedCode && (
                      <button onClick={handleAssignId} disabled={loading} className="flex-[1.5] min-w-[100px] py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50">ID berish</button>
                    )}
                    <button onClick={handleStartSaleFlow} className="flex-1 min-w-[80px] py-2.5 bg-success text-success-foreground rounded-lg text-sm font-medium hover:bg-success/90">Sotildi</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Sale section - only show if sold or already has sale. Hide action buttons if readOnly. */}
          {(localClient.stage === "sold" || sale.status !== "none" || showSaleFlow) && (
            <section className="rounded-xl border border-border p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Sotuv
              </h3>

              {sale.status === "none" && !showPurchase && (
                <button
                  onClick={() => setShowPurchase(true)}
                  disabled={session?.isActive === false || readOnly}
                  className="w-full py-2.5 rounded-lg bg-success text-white font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sotuvni rasmiylashtirish
                </button>
              )}

              {sale.status === "none" && showPurchase && purchaseMode === "choose" && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPurchaseMode("full")}
                    className="py-3 rounded-lg bg-success text-success-foreground font-medium"
                  >
                    To'liq to'lov
                  </button>
                  <button
                    onClick={() => setPurchaseMode("partial")}
                    className="py-3 rounded-lg bg-warning text-warning-foreground font-medium"
                  >
                    Bo'lib to'lash
                  </button>
                  <button
                    onClick={() => { setShowPurchase(false); setPurchaseMode("choose"); setShowSaleFlow(false); }}
                    className="col-span-2 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Bekor qilish
                  </button>
                </div>
              )}

              {sale.status === "none" && purchaseMode === "full" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">To'lov summasi</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatPrice(fullBase)}
                        onChange={(e) => setFullBase(parsePrice(e.target.value))}
                        placeholder="0"
                        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Qo'shimcha summa</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatPrice(fullAdditional)}
                        onChange={(e) => setFullAdditional(parsePrice(e.target.value))}
                        placeholder="0"
                        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Umumiy summa (jami)</label>
                    <input
                      type="text"
                      readOnly
                      value={formatPrice(((parseFloat(fullBase || "0") + parseFloat(fullAdditional || "0")) || "").toString())}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-transparent bg-secondary/50 text-foreground font-bold cursor-not-allowed text-sm"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleFullPurchase} disabled={loading} className="flex-1 py-2 rounded-lg bg-success text-white text-sm font-medium">
                      Tasdiqlash
                    </button>
                    <button onClick={() => setPurchaseMode("choose")} className="px-3 py-2 rounded-lg border border-border text-sm">
                      Orqaga
                    </button>
                  </div>
                </div>
              )}


              {sale.status === "none" && purchaseMode === "partial" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">To'lov summasi</label>
                      <input type="text" inputMode="numeric" value={formatPrice(partialBase)} onChange={(e) => setPartialBase(parsePrice(e.target.value))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Qo'shimcha summa</label>
                      <input type="text" inputMode="numeric" value={formatPrice(partialAdditional)} onChange={(e) => setPartialAdditional(parsePrice(e.target.value))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Umumiy summa</label>
                      <input
                        type="text"
                        readOnly
                        value={formatPrice(((parseFloat(partialBase || "0") + parseFloat(partialAdditional || "0")) || "").toString())}
                        placeholder="0"
                        className="w-full px-3 py-2 rounded-lg border border-transparent bg-secondary/50 text-foreground font-bold cursor-not-allowed text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">To'langan summa</label>
                      <input type="text" inputMode="numeric" value={formatPrice(partialPaid)} onChange={(e) => setPartialPaid(parsePrice(e.target.value))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Keyingi to'lov sanasi</label>
                    <input type="datetime-local" value={partialNextDate} onChange={(e) => setPartialNextDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
                  </div>

                  {/* Required: Telegram warning — must select before confirming lease */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-700 mb-0.5">Telegram ogohlantirish <span className="text-destructive">*</span></p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {leaseWarningTelegramId ? "✓ Foydalanuvchi tanlandi" : "Tasdiqlashdan oldin tanlash shart"}
                      </p>
                    </div>
                    <TelegramUserSingleSelect
                      onSelected={(id) => setLeaseWarningTelegramId(id || null)}
                      excludeIds={attachedTelegramIds}
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handlePartialPurchase}
                      disabled={loading || !leaseWarningTelegramId}
                      className="flex-1 py-2 rounded-lg bg-warning text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Tasdiqlash
                    </button>
                    <button onClick={() => setPurchaseMode("choose")} className="px-3 py-2 rounded-lg border border-border text-sm">
                      Orqaga
                    </button>
                  </div>
                </div>
              )}

              {/* Payment summary + history — show whenever there is any sale data */}
              {(sale.status !== "none" || sale.payments.length > 0) && (
                <div className="space-y-2">
                  {/* Summary row */}
                  {sale.status !== "none" && (
                    <div className="grid grid-cols-3 gap-2 text-sm bg-secondary/40 rounded-lg p-3 text-center">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase">Jami</div>
                        <div className="font-bold text-foreground">{sale.totalAmount?.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase">To'langan</div>
                        <div className="font-bold text-success">{totalPaid.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase">Qoldiq</div>
                        <div className="font-bold text-destructive">{(remaining > 0 ? remaining : 0).toLocaleString()}</div>
                      </div>
                    </div>
                  )}

                  {/* Next payment warning */}
                  {sale.status === "partial" && remaining > 0 && sale.nextPaymentAt && (
                    <div className="flex items-center justify-between text-xs bg-warning/10 text-warning-foreground rounded-lg p-3 border border-warning/20">
                      <div className="flex items-center gap-2">
                        <Bell className="w-3.5 h-3.5" />
                        <span>To'lov sanasi: {formatUzDate(sale.nextPaymentAt)}</span>
                      </div>
                      <div className="font-bold animate-pulse">
                        {Math.max(0, Math.ceil((getTashkentDayjs(sale.nextPaymentAt).valueOf() - getTashkentDayjs().valueOf()) / (1000 * 60 * 60 * 24)))} kun qoldi
                      </div>
                    </div>
                  )}

                  {/* Payment history — always visible when payments exist */}
                  {sale.payments.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">To'lovlar tarixi</h4>
                      <div className="space-y-1.5">
                        {sale.payments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs bg-secondary/30 rounded-lg p-2 group/pay">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{formatUzDate(p.createdAt)}</span>
                              <span className="font-bold text-foreground">{p.amount.toLocaleString()}</span>
                            </div>
                            {!readOnly && (
                              <div className="flex items-center gap-1 opacity-0 group-hover/pay:opacity-100 transition-opacity">
                                <button
                                  onClick={() => { setSingleTelegramId(null); setShowTelegramModal(true); }}
                                  className="p-1 hover:bg-primary/10 text-primary rounded"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                                {viewerRole === "director" && (
                                  <button
                                    onClick={() => setPaymentToDelete(p.id)}
                                    className="p-1 hover:bg-destructive/10 text-destructive rounded"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* New payment input — only for partial status */}
                  {sale.status === "partial" && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Yangi to'lov</label>
                      {!readOnly && session?.isActive !== false ? (
                        <>
                          <div className="flex gap-2 max-w-full">
                            <input type="text" inputMode="numeric" value={formatPrice(extraAmount)} onChange={(e) => setExtraAmount(parsePrice(e.target.value))} placeholder="0" className="flex-1 px-3 py-2.5 rounded-lg border border-input bg-background text-sm" />
                            <button onClick={handleAddPayment} disabled={loading} className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold whitespace-nowrap">
                              To'lov qo'shish
                            </button>
                          </div>
                          <button onClick={() => setShowFullPaymentConfirm(true)} className="w-full py-2 rounded-lg bg-success/15 text-success text-xs font-bold hover:bg-success/20 transition-colors">
                            To'lovni yakunlash
                          </button>
                        </>
                      ) : (
                        <p className="text-[10px] text-destructive font-bold italic">
                          {readOnly ? "Ko'rish rejimida to'lov qo'shish mumkin emas" : "To'lovni qo'shish uchun hisob faol bo'lishi kerak"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Notes */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Izohlar ({regularNotes.length})
              </h3>
            </div>
            {/* Prominent resell action placed above the note input */}
            {viewerRole === "director" && !readOnly && localClient.stage === "sold" && (
              <div className="mb-3">
                <button
                  onClick={() => setShowResellConfirm(true)}
                  disabled={loading || session?.isActive === false}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-black shadow-lg hover:shadow-glow transition-all flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-4 h-4" /> Qayta sotish — yangi lid yaratish
                </button>
                <p className="text-[11px] text-muted-foreground mt-2">Asosiy mijozning sotuv tarixlari saqlanadi; yangi lid "Yangi" bo'limida paydo bo'ladi.</p>
              </div>
            )}
            <div className="flex gap-2 mb-3">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                disabled={session?.isActive === false || readOnly}
                placeholder={readOnly ? "Ko'rish rejimida izoh qoldirib bo'lmaydi" : session?.isActive === false ? "Izoh qoldirish cheklangan..." : "Yangi izoh..."}
                className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              {!readOnly && (
                <button
                  onClick={handleAddNote}
                  disabled={loading || session?.isActive === false}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
                >
                  Qo'shish
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {regularNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-4">Izohlar yo'q</p>
              ) : (
                [...regularNotes].reverse().map((n) => (
                  <div key={n.id} className="rounded-xl bg-secondary/30 border border-border/50 p-3">
                    <p className="text-sm text-foreground leading-relaxed">{n.text}</p>
                    <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                      <span className="font-medium text-primary">{n.authorName}</span>
                      <span>{formatUzDateTime(n.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="border-t border-border pt-5 flex flex-col items-center gap-3">
            {session?.isActive === false && (
              <div className="flex items-center gap-2 text-destructive text-[10px] font-bold uppercase tracking-widest bg-destructive/5 px-3 py-1.5 rounded-lg border border-destructive/10">
                <AlertCircle className="w-3.5 h-3.5" /> Hisob faolsizlantirilgan
              </div>
            )}
            {viewerRole === "director" && !readOnly && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading || session?.isActive === false}
                className="inline-flex items-center gap-2 text-xs text-destructive hover:underline font-medium disabled:opacity-30 disabled:no-underline"
              >
                <Trash2 className="w-3.5 h-3.5" /> Mijozni o'chirib tashlash
              </button>
            )}
          </section>
        </div>
      </div>

      {/* Ma'lumot qo'shish — type choice modal */}
      {showAddInfoChoice && !addInfoType && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl border border-border shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/60">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Yangi</p>
                <h3 className="text-base font-bold text-foreground leading-tight">Ma'lumot qo'shish</h3>
              </div>
              <button
                onClick={() => setShowAddInfoChoice(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary hover:bg-secondary/70 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Options */}
            <div className="grid grid-cols-2 gap-3 p-5">
              <button
                onClick={() => setAddInfoType("image")}
                className="group relative flex flex-col items-center gap-3 pt-6 pb-5 px-4 rounded-2xl border-2 border-border bg-secondary/30 hover:border-primary hover:bg-primary/5 transition-all duration-200 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <Image className="w-6 h-6 text-blue-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Rasm</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">10 tagacha</p>
                </div>
              </button>

              <button
                onClick={() => setAddInfoType("text")}
                className="group relative flex flex-col items-center gap-3 pt-6 pb-5 px-4 rounded-2xl border-2 border-border bg-secondary/30 hover:border-primary hover:bg-primary/5 transition-all duration-200 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
                  <FileText className="w-6 h-6 text-violet-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Matn</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Eslatma yozing</p>
                </div>
              </button>
            </div>

            <div className="pb-6 px-5">
              <button
                onClick={() => setShowAddInfoChoice(false)}
                className="w-full py-2.5 rounded-xl bg-secondary/60 text-sm text-muted-foreground font-medium hover:bg-secondary transition-colors"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ma'lumot qo'shish — text modal */}
      {showAddInfoChoice && addInfoType === "text" && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-border shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                  <FileText className="w-4.5 h-4.5 text-violet-500 w-[18px] h-[18px]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Matn</p>
                  <h3 className="text-sm font-bold text-foreground">Eslatma yozish</h3>
                </div>
              </div>
              <button
                onClick={() => { setAddInfoType(null); setInfoText(""); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary hover:bg-secondary/70 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <textarea
                autoFocus
                value={infoText}
                onChange={e => setInfoText(e.target.value)}
                placeholder="Matn kiriting..."
                className="w-full px-4 py-3 rounded-xl border border-input bg-secondary/30 text-sm min-h-[140px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 resize-none transition-all placeholder:text-muted-foreground/60"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{infoText.length} belgi</span>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => { setAddInfoType(null); setInfoText(""); }}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors"
                >
                  Orqaga
                </button>
                <button
                  onClick={handleAddInfoText}
                  disabled={loading || !infoText.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all"
                >
                  {loading ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ma'lumot qo'shish — image upload modal */}
      {showAddInfoChoice && addInfoType === "image" && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-border shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Image className="w-[18px] h-[18px] text-blue-500" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Rasm</p>
                  <h3 className="text-sm font-bold text-foreground">Rasm yuklash</h3>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedImages.length > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {selectedImages.length}/10
                  </span>
                )}
                <button
                  onClick={() => { setAddInfoType(null); setSelectedImages([]); setImagePreviewUrls([]); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary hover:bg-secondary/70 transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleImagesSelected(e.target.files)}
              />

              {selectedImages.length < 10 && (
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-2xl py-8 flex flex-col items-center gap-2.5 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center group-hover:bg-blue-500/10 transition-colors">
                    <Plus className="w-6 h-6 text-muted-foreground group-hover:text-blue-500 transition-colors" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Rasmlarni tanlang</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Maksimal 10 ta · JPG, PNG, WEBP</p>
                  </div>
                </button>
              )}

              {imagePreviewUrls.length > 0 && (
                <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto rounded-xl">
                  {imagePreviewUrls.map((url, i) => (
                    <div key={i} className="relative group aspect-square">
                      <img
                        src={url}
                        alt={`rasm ${i + 1}`}
                        className="w-full h-full object-cover rounded-xl border border-border"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition-all" />
                      <button
                        onClick={() => handleRemoveImage(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-destructive text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-bold shadow-md"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/50 rounded px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {i + 1}
                      </span>
                    </div>
                  ))}
                  {selectedImages.length < 10 && (
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-border flex items-center justify-center hover:border-blue-500/50 hover:bg-blue-500/5 transition-all"
                    >
                      <Plus className="w-5 h-5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => { setAddInfoType(null); setSelectedImages([]); setImagePreviewUrls([]); }}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors"
                >
                  Orqaga
                </button>
                <button
                  onClick={handleUploadImages}
                  disabled={imageUploading || selectedImages.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all"
                >
                  {imageUploading
                    ? `Saqlanmoqda... (${selectedImages.length} ta)`
                    : `${selectedImages.length > 0 ? `${selectedImages.length} ta rasmni ` : ""}Saqlash`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Mijozni o'chirish"
        description="Ushbu mijozni o'chirishni tasdiqlaysizmi? Bu harakatni ortga qaytarib bo'lmaydi."
        confirmLabel="O'chirish"
        tone="destructive"
        loading={loading}
      />

      <ConfirmModal
        isOpen={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={handleConfirmClose}
        title="Sotov jarayonini bekor qilish"
        description="Sotov hali yakunlanmagan. Agar yopsangiz, mijoz 'Gaplashildi' bosqichida qoladi. Davom etasizmi?"
        confirmLabel="Yopish"
        tone="destructive"
        loading={false}
      />

      <ConfirmModal
        isOpen={showFullPaymentConfirm}
        onClose={() => setShowFullPaymentConfirm(false)}
        onConfirm={() => {
          handleCompletePayment();
          setShowFullPaymentConfirm(false);
        }}
        title="To'lovni yakunlash"
        description={`Mijoz barcha qolgan summani (${remaining.toLocaleString()} so'm) to'laganini va sotuvni muvaffaqiyatli yakunlashni tasdiqlaysizmi?`}
        confirmLabel="Tasdiqlash"
        tone="success"
        loading={loading}
      />

      <ConfirmModal
        isOpen={!!paymentToDelete}
        onClose={() => setPaymentToDelete(null)}
        onConfirm={handleDeletePayment}
        title="To'lovni o'chirish"
        description="Ushbu to'lovni o'chirishni tasdiqlaysizmi? Bu harakat sotuv balansiga ta'sir qiladi."
        confirmLabel="O'chirish"
        tone="destructive"
        loading={loading}
      />

      <ConfirmModal
        isOpen={showResellConfirm}
        onClose={() => setShowResellConfirm(false)}
        onConfirm={handleResell}
        title="Qayta sotish"
        description="Ushbu mijoz uchun yangi lid yaratilsinmi? Asosiy (sotilgan) mijoz tarixlari saqlanadi."
        confirmLabel="Yaratish"
        tone="primary"
        loading={loading}
      />

      {showTelegramModal && (
        <TelegramMessageModal
          selectedTelegramIds={singleTelegramId ? [singleTelegramId] : []}
          clientId={localClient.id}
          onClose={() => {
            setShowTelegramModal(false);
            setSingleTelegramId(null);
          }}
          onSuccess={() => {
            setShowTelegramModal(false);
            setSingleTelegramId(null);
          }}
        />
      )}

      {showReminderModal && (
        <ReminderModal
          isOpen={showReminderModal}
          onClose={() => setShowReminderModal(false)}
          onConfirm={(time) => {
            setCallReminder(time);
            handleCompleteCall("no_answer");
          }}
          loading={loading}
        />
      )}
      {showTalkedReminderModal && (
        <ReminderModal
          isOpen={showTalkedReminderModal}
          onClose={() => setShowTalkedReminderModal(false)}
          onConfirm={(time) => {
            setCallReminder(time);
            handleCompleteCall("talked");
          }}
          title="Keyingi aloqa"
          description="Mijoz bilan yana qachon bog'lanishni rejalashtiramiz?"
          loading={loading}
        />
      )}
    </div>
  );
}
