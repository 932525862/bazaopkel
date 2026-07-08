import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Camera, Check, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (photoDataUrl: string) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export function CameraCheckInDialog({ open, onOpenChange, onConfirm, title, description, confirmLabel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      stopStream();
      setPhoto(null);
      setError(null);
      return;
    }
    startStream();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e: any) {
      setError("Kameraga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering.");
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const takePhoto = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const w = v.videoWidth || 480;
    const h = v.videoHeight || 360;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const data = c.toDataURL("image/jpeg", 0.7);
    setPhoto(data);
    stopStream();
  };

  const retake = () => {
    setPhoto(null);
    startStream();
  };

  const finish = () => {
    if (!photo) {
      toast.error("Avval suratga oling");
      return;
    }
    onConfirm(photo);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? "Davomatga kelish"}</DialogTitle>
          <DialogDescription>
            {description ?? "Kameraga ruxsat bering va suratga olib davomatni yakunlang."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
            {error ? (
              <p className="text-destructive text-sm p-4 text-center">{error}</p>
            ) : photo ? (
              <img src={photo} alt="Suratingiz" className="w-full h-full object-cover" />
            ) : (
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="flex gap-2 justify-end">
            {!photo ? (
              <button
                onClick={takePhoto}
                disabled={!!error}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium shadow-md transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" /> Suratga olish
              </button>
            ) : (
              <>
                <button
                  onClick={retake}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-input bg-card text-card-foreground hover:bg-secondary/50 transition-colors"
                >
                  <X className="w-4 h-4" /> Qayta olish
                </button>
                <button
                  onClick={finish}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium shadow-md transition-all hover:bg-primary/90"
                >
                  <Check className="w-4 h-4" /> {confirmLabel ?? "Davomatni yakunlash"}
                </button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
