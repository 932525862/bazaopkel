import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast glass-toast group-[.toaster]:bg-card/30 group-[.toaster]:text-foreground group-[.toaster]:border-white/10 group-[.toaster]:shadow-2xl !p-5 !min-w-[400px] !rounded-2xl",
          success: "glass-toast-success",
          error: "glass-toast-error",
          warning: "glass-toast-warning",
          info: "glass-toast-info",
          description: "group-[.toast]:text-muted-foreground font-medium text-sm",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-bold rounded-xl px-4 py-2 hover:opacity-90 transition-opacity",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground font-bold rounded-xl px-4 py-2 hover:bg-muted/80 transition-colors",
        },
      }}
      visibleToasts={3}
      expand={true}
      {...props}
    />
  );
};

export { Toaster };
