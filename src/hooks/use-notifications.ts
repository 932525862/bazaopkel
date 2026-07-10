import { useState, useEffect, useCallback } from "react";
import { API } from "@/lib/api/client";
import { notify } from "@/lib/notify";


let globalNotifications: any[] = [];
let globalUnreadCount = 0;
let globalIsLoading = false;
let globalTotalPages = 1;
let globalCurrentPage = 1;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

const globalNotificationHandler = (event: string, data: any) => {
  if (event === "notification") {
    // Prevent duplicates
    const exists = globalNotifications.some((n) => n.id === data.id);
    if (!exists) {
      globalNotifications = [data, ...globalNotifications];
      globalUnreadCount += 1;
      notify.info(data.message);
      notifyListeners();
    }
  }
};

export function useNotifications() {
  const [state, setState] = useState({
    notifications: globalNotifications,
    unreadCount: globalUnreadCount,
    isLoading: globalIsLoading,
    totalPages: globalTotalPages,
    currentPage: globalCurrentPage,
  });

  useEffect(() => {
    const handleChange = () => {
      setState({
        notifications: globalNotifications,
        unreadCount: globalUnreadCount,
        isLoading: globalIsLoading,
        totalPages: globalTotalPages,
        currentPage: globalCurrentPage,
      });
    };
    listeners.add(handleChange);
    return () => {
      listeners.delete(handleChange);
    };
  }, []);

  const fetchNotifications = useCallback(async (page: number = 1, limit: number = 20) => {
    globalIsLoading = true;
    notifyListeners();
    try {
      const data = await API.notifications(page, limit);
      globalNotifications = data.items;
      globalTotalPages = data.totalPages;
      globalCurrentPage = data.page;
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    } finally {
      globalIsLoading = false;
      notifyListeners();
    }
  }, []);

  // Badge/bell doim serverdagi HAQIQIY (barcha sahifalar bo'yicha) o'qilmagan sonini
  // ko'rsatishi kerak — sahifalangan ro'yxatning bitta sahifasidan hisoblash noto'g'ri
  // bo'lib qolardi (masalan 2-sahifaga o'tilganda badge yolg'on pasayib ketardi).
  const fetchUnreadCount = useCallback(async () => {
    try {
      const { count } = await API.unreadNotificationCount();
      globalUnreadCount = count;
      notifyListeners();
    } catch (err) {
      console.error("Failed to fetch unread notification count", err);
    }
  }, []);

  useEffect(() => {
    // Only fetch if empty or on mount once - actually fetchNotifications is called by components
    // and we also have a sync mechanism
    if (globalNotifications.length === 0 && !globalIsLoading) {
      fetchNotifications();
    }
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  // Subscribe to real-time notifications globally once
  useEffect(() => {
    API.initSocket(globalNotificationHandler);
    // Note: We don't return the cleanup here because we want this dedicated 
    // global handler to persist throughout the app lifecycle.
    // API.initSocket uses a Set, so adding the same reference multiple times is safe.
  }, []);

  const markRead = async (id: string) => {
    try {
      await API.markNotificationRead(id);
      globalNotifications = globalNotifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      );
      globalUnreadCount = Math.max(0, globalUnreadCount - 1);
      notifyListeners();
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  const markAllRead = async () => {
    try {
      await API.markAllNotificationsRead();
      globalNotifications = globalNotifications.map((n) => ({ ...n, isRead: true }));
      globalUnreadCount = 0;
      notifyListeners();
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  return {
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    isLoading: state.isLoading,
    totalPages: state.totalPages,
    currentPage: state.currentPage,
    fetchNotifications,
    markRead,
    markAllRead,
  };
}
