import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { useEffect } from "react";
import { useSession, saveSession, useAppState } from "@/lib/store";
import { API, getToken, setToken } from "@/lib/api/client";
import { registerPushNotifications } from "@/lib/push-notification";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "tourlandcrm" },
      { name: "description", content: "crm" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "tourlandcrm" },
      { property: "og:description", content: "crm" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "tourlandcrm" },
      { name: "twitter:description", content: "crm" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/AR509F0S4bU2SL73fBKpL6QQ2pD2/social-images/social-1777918674811-photo_2024-09-25_15-52-56.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/AR509F0S4bU2SL73fBKpL6QQ2pD2/social-images/social-1777918674811-photo_2024-09-25_15-52-56.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const session = useSession();
  const { update } = useAppState();

  useEffect(() => {
    const token = getToken();
    if (token) {
      API.me()
        .then((user) => {
          const roleStr = user.role?.toLowerCase() || 'employee';
          const fullName = `${user.firstName} ${user.lastName}`.trim();
          const sessionData: any = { 
            id: user.id || user.sub, 
            role: roleStr, 
            name: fullName, 
            login: user.phoneNumber, 
            isActive: user.isActive 
          };
          saveSession(sessionData);

          if (roleStr === "director") {
            update((s: any) => ({
              ...s,
              director: { ...s.director, name: fullName, login: user.phoneNumber },
            }));
          } else {
            API.employees().then((employees: any[]) =>
              update((s: any) => ({ ...s, employees }))
            );
          }

          // Register for push notifications
          registerPushNotifications();
        })
        .catch(() => {
          setToken(null);
          saveSession(null);
        });
    }
  }, [update]);

  return (
    <>
      <Outlet />
      <Toaster richColors position="top-right" />
    </>
  );
}
