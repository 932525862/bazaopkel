import { User as UserIcon, Phone, Bell, MessageCircle, Lock } from "lucide-react";
import { formatUzDate } from "@/lib/date-utils";
import type { Client } from "@/lib/types";

interface Props {
  client: Client;
  onClick: () => void;
}

export function ClientCard({ client, onClick }: Props) {
  const sale = client.sale;
  return (
    <div 
      onClick={onClick}
      className="bg-card border border-border rounded-[28px] p-6 hover:shadow-glow hover:border-primary/30 transition-all cursor-pointer group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-125" />
      
      <div className="flex items-start justify-between gap-3 mb-5 relative z-10">
        <div className="w-14 h-14 rounded-[20px] bg-primary-soft flex items-center justify-center text-primary group-hover:scale-110 transition-transform shadow-sm">
          <UserIcon className="w-7 h-7" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {client.call?.inCallByEmployeeId && (
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-bold uppercase tracking-widest border border-destructive/20 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Band
            </span>
          )}
          {sale?.status === "full" && (
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-success/15 text-success font-black uppercase tracking-widest border border-success/20">Sotildi</span>
          )}
          {sale?.status === "partial" && (
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-warning/15 text-warning font-black uppercase tracking-widest border border-warning/20">Nasiya</span>
          )}
          {!sale?.status || sale.status === "none" && (
             <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-black uppercase tracking-widest border border-border">Lid</span>
          )}
          <span className="text-[10px] text-muted-foreground font-medium">{formatUzDate(client.createdAt)}</span>
        </div>
      </div>
      
      <div className="min-w-0 relative z-10">
        <h3 className="text-xl font-bold text-foreground truncate group-hover:text-primary transition-colors mb-1">
          {client.data?.["Ism familya"] || client.name || "Noma'lum"}
        </h3>
        <p className="text-sm text-muted-foreground flex items-center gap-2 font-medium">
          <Phone className="w-4 h-4 text-primary" /> {client.phone || "—"}
        </p>
      </div>

      <div className="mt-5 pt-5 border-t border-border flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          {client.notes && client.notes.length > 0 && (
            <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground font-bold flex items-center gap-1.5">
               <MessageCircle className="w-3 h-3" /> {client.notes.length}
            </span>
          )}
        </div>
        {client.call?.remindAt && (
           <span className="text-[10px] px-2.5 py-1 rounded-lg bg-warning/15 text-warning-foreground font-black uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
             <Bell className="w-3 h-3" /> Eslatma
           </span>
        )}
      </div>
    </div>
  );
}
