// Socket.IO client hook — connects to backend WS at `/ws` with the JWT token.
import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getToken, apiBase } from "./client";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  const token = getToken();
  if (!token) return null;
  if (socket && socket.connected) return socket;
  const base = apiBase().replace(/\/api$/, "");
  socket = io(base || "/", {
    path: "/ws",
    transports: ["websocket"],
    auth: { token },
    reconnection: true,
  });
  return socket;
}

export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => { s.off(event, fn); };
  }, [event]);
}
