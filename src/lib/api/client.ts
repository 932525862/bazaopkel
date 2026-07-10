import { Role, TaskStatus } from "../types";
import { io, Socket } from "socket.io-client";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "agency_crm_token";

let socket: Socket | null = null;
const listeners = new Set<(event: string, data: any) => void>();

function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function connectSocket(): Socket {
  const token = getToken();
  const url = API_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const s = io(url, {
    auth: { token },
    transports: ["websocket"],
  });

  const notify = (ev: string, data: any) => {
    listeners.forEach(l => l(ev, data));
  };

  s.on("connect", () => console.log("WS connected"));
  s.on("notification", (data) => notify("notification", data));
  s.on("taskCreated", (data) => notify("taskCreated", data));
  s.on("taskStatusChanged", (data) => notify("taskStatusChanged", data));
  s.on("taskVerified", (data) => notify("taskVerified", data));
  s.on("taskIncomplete", (data) => notify("taskIncomplete", data));
  s.on("taskRejected", (data) => notify("taskRejected", data));
  s.on("attendanceCheckedIn", (data) => notify("attendanceCheckedIn", data));
  s.on("attendanceCheckedOut", (data) => notify("attendanceCheckedOut", data));
  s.on("userUpdated", (data) => notify("userUpdated", data));
  s.on("clientCallStarted", (data) => notify("clientCallStarted", data));
  s.on("clientCallEnded", (data) => notify("clientCallEnded", data));
  s.on("clientUpdated", (data) => notify("clientUpdated", data));
  s.on("clientReminder", (data) => notify("clientReminder", data));
  s.on("paymentReminder", (data) => notify("paymentReminder", data));

  return s;
}

/** Access token yangilanganda (refresh) ochiq socket ulanishini yangi token bilan
 *  qayta o'rnatadi — aks holda 15 daqiqadan keyin real-vaqt bildirishnomalar
 *  jim tarzda to'xtab qoladi (eski token bilan qayta-qayta ulanishga urinaveradi). */
function reconnectSocketWithFreshToken() {
  if (!socket) return;
  socket.disconnect();
  socket = connectSocket();
}

export function apiBase() {
  return API_URL ? `${API_URL}/api` : "/api";
}
export function assetUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("data:") || path.startsWith("http")) return path;
  const base = API_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

const REFRESH_TOKEN_KEY = "agency_crm_refresh_token";

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(REFRESH_TOKEN_KEY, t);
  else localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** Joriy foydalanuvchining real-vaqt ulanishini uzadi — logout paytida chaqiriladi,
 *  aks holda keyingi login xuddi shu (eski) ulanishni qayta ishlatib yuborishi mumkin. */
export function disconnectSocket() {
  closeSocket();
}

let isRefreshing = false;
let refreshQueue: Array<() => void> = [];

async function refreshTokens() {
  const rt = getRefreshToken();
  if (!rt) throw new Error("No refresh token");
  const res = await fetch(`${apiBase()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) throw new Error("Refresh failed");
  const data = await res.json();
  setToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  reconnectSocketWithFreshToken();
  return data;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (!headers["Content-Type"] && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  if (res.status === 401 && getRefreshToken() && !path.includes("/auth/refresh")) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        await refreshTokens();
        isRefreshing = false;
        refreshQueue.forEach(cb => cb());
        refreshQueue = [];
      } catch (e) {
        isRefreshing = false;
        refreshQueue = [];
        setToken(null);
        setRefreshToken(null);
        closeSocket();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        throw e;
      }
    } else {
      return new Promise((resolve, reject) => {
        refreshQueue.push(() => {
          api<T>(path, init).then(resolve).catch(reject);
        });
      });
    }
    return api<T>(path, init);
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const b = await res.json();
      if (typeof b.message === "string") msg = b.message;
      else if (Array.isArray(b.message)) msg = b.message.join(", ");
      else msg = b.message || JSON.stringify(b);
    } catch { }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

const cleanPhone = (phone: string | undefined) => phone ? phone.replace(/\s+/g, "") : "";

export const API = {
  login: (login: string, password: string) =>
    api<{ accessToken: string; refreshToken: string }>("/auth/login", { method: "POST", json: { phoneNumber: cleanPhone(login), password } }),
  refresh: (refreshToken: string) =>
    api<{ accessToken: string; refreshToken: string }>("/auth/refresh", { method: "POST", json: { refreshToken } }),
  logout: () => api("/auth/logout", { method: "POST" }),

  // me
  me: () => api<any>("/users/me").then(user => {
    return {
      ...user,
      id: user.id || "me",
      isActive: user.isActive !== undefined ? !!user.isActive : true,
      canAccessDepartments: user.canAccessDepartments !== undefined ? !!user.canAccessDepartments : true,
      canAccessForms: user.canAccessForms !== undefined ? !!user.canAccessForms : true,
    }
  }),
  updateProfile: (data: { firstName?: string; lastName?: string; phoneNumber?: string }) =>
    api<any>("/users/profile", {
      method: "PATCH",
      json: { ...data, phoneNumber: cleanPhone(data.phoneNumber) }
    }),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    api("/users/director/change-password", { method: "PATCH", json: data }),
  activateUser: (id: string) => api(`/users/${id}/activate`, { method: "POST" }),
  deactivateUser: (id: string) => api(`/users/${id}/deactivate`, { method: "POST" }),

  // Forgot password / OTP (Telegram orqali yuboriladi)
  requestPasswordReset: (phoneNumber: string) =>
    api<{ message: string }>("/auth/forgot-password/request", { method: "POST", json: { phoneNumber: cleanPhone(phoneNumber) } }),
  verifyPincode: (phoneNumber: string, pincode: string) =>
    api<{ valid: boolean }>("/auth/verify-pincode", { method: "POST", json: { phoneNumber: cleanPhone(phoneNumber), pincode } }),
  resetPassword: (phoneNumber: string, pincode: string, newPassword: string) =>
    api("/auth/forgot-password", { method: "POST", json: { phoneNumber: cleanPhone(phoneNumber), pincode, newPassword } }),

  // employees -> /users/employees
  employees: () => api<any[]>("/users/employees").then(list => list.map(e => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    phone: e.phoneNumber,
    login: e.phoneNumber,
    password: "",
    isActive: e.isActive,
    canAccessDepartments: !!e.canAccessDepartments,
    canAccessForms: !!e.canAccessForms,
    canEditWarehouseArchive: !!e.canEditWarehouseArchive,
    createdAt: e.createdAt,
  }))),

  // categories -> /departments
  categories: () => api<any[]>("/departments").then(list => list.map(c => ({
    id: c.id,
    name: c.name,
    isArchive: c.isArchive
  }))),

  // forms -> /forms
  forms: () => api<any[]>("/forms").then(list => list.map(f => ({
    id: f.id,
    title: f.title,
    targetCategoryId: f.targetDepartmentId,
    fields: f.fields,
    createdAt: f.createdAt
  }))),
  createForm: (data: any) => api("/forms", {
    method: "POST",
    json: {
      title: data.title,
      targetDepartmentId: data.targetCategoryId,
      fields: data.fields
    }
  }),
  updateForm: (id: string, data: any) => api(`/forms/${id}`, {
    method: "PATCH",
    json: {
      title: data.title,
      targetDepartmentId: data.targetCategoryId,
      fields: data.fields
    }
  }),
  deleteForm: (id: string) => api(`/forms/${id}`, { method: "DELETE" }),
  createEmployee: (data: any) =>
    api("/users/employees", {
      method: "POST",
      json: {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: cleanPhone(data.phoneNumber || data.phone),
        password: data.password,
        canAccessDepartments: data.canAccessDepartments,
        canAccessForms: data.canAccessForms,
        canEditWarehouseArchive: data.canEditWarehouseArchive
      }
    }),
  updateEmployee: (id: string, data: any) =>
    api(`/users/employees/${id}`, {
      method: "PATCH",
      json: {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: cleanPhone(data.phoneNumber || data.phone),
        password: data.password,
        isActive: data.isActive,
        canAccessDepartments: data.canAccessDepartments,
        canAccessForms: data.canAccessForms,
        canEditWarehouseArchive: data.canEditWarehouseArchive
      }
    }),
  deleteEmployee: (id: string) => api(`/users/${id}/deactivate`, { method: "POST" }),

  createCategory: (data: any) => api("/departments", { method: "POST", json: data }),
  updateCategory: (id: string, name: string) => api(`/departments/${id}`, { method: "PATCH", json: { name } }),
  toggleArchiveCategory: (id: string) => api(`/departments/${id}/archive`, { method: "PATCH" }),
  deleteCategory: (id: string) => api(`/departments/${id}`, { method: "DELETE" }),

  // forms
  publicForm: (id: string) => api<any>(`/forms/public/${id}`),

  // clients
  clients: (q: { categoryId?: string; stage?: string } = {}) => {
    const params: any = {};
    if (q.categoryId) params.departmentId = q.categoryId;
    if (q.stage) params.stage = q.stage;
    const sp = new URLSearchParams(params).toString();
    return api<any[]>(`/clients${sp ? `?${sp}` : ""}`).then(list => list.map(c => ({
      ...c,
      name: c.fullName,
      phone: c.phoneNumber,
      categoryId: c.departmentId,
      call: {
        inCallByEmployeeId: c.inCallByEmployeeId,
        inCallByName: c.inCallByName,
        startedAt: c.callStartedAt,
        remindAt: c.remindAt
      },
      sale: {
        status: (c.saleStatus || 'NONE').toLowerCase(),
        totalAmount: c.saleTotalAmount,
        additionalPrice: c.saleAdditionalPrice,
        payments: c.payments || [],
        nextPaymentAt: c.nextPaymentAt,
        soldAt: c.soldAt,
        completedByName: c.soldByName
      }
    })));
  },
  client: (id: string) => api<any>(`/clients/${id}`).then(c => ({
    ...c,
    name: c.fullName,
    phone: c.phoneNumber,
    categoryId: c.departmentId,
    call: {
      inCallByEmployeeId: c.inCallByEmployeeId,
      inCallByName: c.inCallByName,
      startedAt: c.callStartedAt,
      remindAt: c.remindAt
    },
    sale: {
      status: c.saleStatus?.toLowerCase() || 'none',
      totalAmount: c.saleTotalAmount,
      additionalPrice: c.saleAdditionalPrice,
      payments: c.payments || [],
      nextPaymentAt: c.nextPaymentAt,
      soldAt: c.soldAt,
      completedByName: c.soldByName
    }
  })),
  createClient: (data: any) => api<any>("/clients", {
    method: "POST",
    json: {
      fullName: data.name || data.fullName,
      phoneNumber: data.phone || data.phoneNumber,
      departmentId: data.categoryId || data.departmentId,
      description: data.description || ""
    }
  }),
  updateClient: (id: string, data: any) => api(`/clients/${id}`, {
    method: "PATCH",
    json: {
      fullName: data.name || data.fullName,
      phoneNumber: data.phone || data.phoneNumber,
      departmentId: data.categoryId || data.departmentId,
      stage: data.stage,
      remindAt: data.remindAt,
      description: data.description,
      clientCode: data.clientCode,
    }
  }),
  deleteClient: (id: string) => api(`/clients/${id}`, { method: "DELETE" }),
  callStart: (id: string) => api(`/clients/${id}/call/start`, { method: "POST" }),
  addNote: (id: string, text: string) => api(`/clients/${id}/notes`, { method: "POST", json: { text } }),
  addPayment: (id: string, amount: number) => api(`/clients/${id}/payments`, { method: "POST", json: { amount } }),
  deletePayment: (id: string) => api(`/clients/payments/${id}`, { method: "DELETE" }),
  setSale: (id: string, data: any) => api(`/clients/${id}/sale`, { method: "PATCH", json: { ...data, status: data.status?.toLowerCase() } }),
  warnClient: (id: string, remindAt: string) => api(`/clients/${id}/warn`, { method: "POST", json: { remindAt } }),
  // Keyingi tartibli mijoz kodini (OK/8...) serverda ATOMIK tarzda biriktiradi va yangilangan mijozni qaytaradi
  assignClientCode: (id: string) => api<any>(`/clients/${id}/assign-code`, { method: "POST" }),

  importExcel: (file: File, departmentId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('departmentId', departmentId);
    
    return api<{ imported: number; skipped: number; total: number }>("/clients/import-excel", {
      method: "POST",
      body: formData,
      headers: {
        // Leave Content-Type empty so fetch sets it automatically with the boundary for FormData
      }
    } as any); // Type cast because api() expects json or body
  },

  // attendance
  attendance: (q: { employeeId?: string; date?: string } = {}) => {
    const sp = new URLSearchParams(q as Record<string, string>).toString();
    return api<any[]>(`/attendance${sp ? `?${sp}` : ""}`).then(list => list.map(a => ({
      ...a,
      employeeName: a.employee ? `${a.employee.firstName} ${a.employee.lastName}`.trim() : "Unknown",
      photo: a.checkInPhoto || a.photo,
      checkOutPhoto: a.checkOutPhoto,
      status: a.status ?? (() => {
        if (a.checkOutAt) return 'ATTENDED';
        if (!a.checkInAt) return 'ABSENT';
        const isToday = a.date === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
        return isToday ? 'PRESENT' : 'ATTENDED';
      })(),
    })));
  },
  backfillAttendance: (days: number = 30) => api(`/attendance/backfill?days=${days}`, { method: "POST" }),
  myAttendance: () => {
    return api<any[]>("/attendance/my").then(list => list.map(a => ({
      ...a,
      employeeName: a.employee ? `${a.employee.firstName} ${a.employee.lastName}`.trim() : "Unknown",
      photo: a.checkInPhoto || a.photo,
      checkOutPhoto: a.checkOutPhoto,
      status: a.status ?? (() => {
        if (a.checkOutAt) return 'ATTENDED';
        if (!a.checkInAt) return 'ABSENT';
        const isToday = a.date === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
        return isToday ? 'PRESENT' : 'ATTENDED';
      })(),
    })));
  },
  checkIn: (photo?: string) => api("/attendance/check-in", { method: "POST", json: { photo } }),
  checkOut: (id: string, photo?: string) =>
    api(`/attendance/check-out`, { method: "POST", json: { photo } }),

  tasks: (role: Role) => {
    const mapTask = (t: any) => {
      const template = t.template || t;
      const rawStatus = (t.status || "TODO").toUpperCase();

      return {
        id: t.id,
        title: template.title || "Nomsiz",
        description: template.description || "",
        assignedTo: t.assignedTo,
        notifyAt: template.notifyAt || "9:00 AM",
        startDate: template.startDate || "",
        endDate: template.endDate || "",
        status: rawStatus.toLowerCase() as TaskStatus,
        templateId: t.templateId,
        completionDescription: t.completionDescription,
        completionLink: t.completionLink,
        rejectionReason: t.rejectionReason,
        createdAt: t.createdAt,
        seenByEmployee: true,
        seenByDirector: true,
      };
    };
    const path = role === "director" ? "/tasks/director/dashboard" : "/tasks/employee/me";
    return api<any[]>(path).then(list => (Array.isArray(list) ? list.map(mapTask) : []));
  },
  createTask: (data: {
    title: string;
    description: string;
    assignedTo: string;
    notifyAt: string;
    startDate: string;
    endDate: string
  }) => api("/tasks/template", {
    method: "POST",
    json: data
  }),
  updateTask: (id: string, data: { status: string; completionDescription?: string; completionLink?: string }) => {
    const body: any = { status: data.status.toLowerCase() };
    if (data.completionDescription) body.completionDescription = data.completionDescription;
    if (data.completionLink) body.completionLink = data.completionLink;
    return api(`/tasks/${id}/status`, {
      method: "PATCH",
      json: body
    });
  },
  verifyTask: (id: string) => api(`/tasks/${id}/verify`, { method: "PATCH" }),
  rejectTask: (id: string, reason?: string) => api(`/tasks/${id}/reject`, { method: "PATCH", json: { reason } }),
  taskDetail: (id: string) => api<any>(`/tasks/${id}`),
  templateInstances: (templateId: string) => api<any[]>(`/tasks/template/${templateId}/instances`),

  // archive (activity logs)
  directorArchive: () => api<any[]>("/archive/director"),
  employeeArchive: () => api<any[]>("/archive/employee"),

  // notifications
  notifications: (page: number = 1, limit: number = 20) =>
    api<{ items: any[], total: number, page: number, limit: number, totalPages: number }>(`/notifications?page=${page}&limit=${limit}`),
  unreadNotificationCount: () => api<{ count: number }>("/notifications/unread-count"),
  markNotificationRead: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => api("/notifications/read-all", { method: "POST" }),
  subscribePush: (subscription: any) => api("/notifications/push-subscribe", { method: "POST", json: subscription }),

  // public
  publicSubmit: (formId: string, data: Record<string, any>) =>
    api(`/forms/submit/${formId}`, { method: "POST", json: { data } }),

  // Telegram
  telegramUsers: () => api<any[]>("/telegram/users"),
  telegramBroadcast: (dto: { telegramIds: string[]; description: string; link?: string }) =>
    api("/telegram/broadcast", { method: "POST", json: dto }),
  telegramClientMessage: (dto: { clientId: string; telegramId: string; description: string; link?: string }) =>
    api("/telegram/client-message", { method: "POST", json: dto }),

  // tours
  tours: () => api<any[]>("/tours"),
  createTour: (data: any) => api("/tours", { method: "POST", json: data }),
  updateTour: (id: string, data: any) => api(`/tours/${id}`, { method: "PATCH", json: data }),
  deleteTour: (id: string) => api(`/tours/${id}`, { method: "DELETE" }),

  // WebSocket
  initSocket: (onEvent: (event: string, data: any) => void) => {
    listeners.add(onEvent);
    if (!socket) socket = connectSocket();
    return () => { listeners.delete(onEvent); };
  },
  disconnectSocket: () => {
    closeSocket();
  }
};
