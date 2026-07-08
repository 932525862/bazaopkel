import { useEffect, useState, useCallback } from "react";
import type {
  AppState,
  Client,
  ClientCategory,
  Employee,
  FormTemplate,
  Director,
  Task,
} from "./types";

const STORAGE_KEY = "agency_crm_state_v1";
const SESSION_KEY = "agency_crm_session_v1";

const defaultState: AppState = {
  director: {
    name: "Direktor",
    login: "admin",
    password: "admin123",
  },
  employees: [
    {
      id: "emp-1",
      firstName: "Aziz",
      lastName: "Karimov",
      phone: "+998 90 123 45 67",
      login: "aziz",
      password: "12345",
      createdAt: new Date().toISOString(),
      isActive: true,
      canAccessDepartments: true,
      canAccessForms: true,
    },
  ],
  forms: [],
  categories: [
    { id: "cat-default", name: "Yangi mijozlar" },
    { id: "cat-archive", name: "Arxiv", isArchive: true },
  ],
  clients: [],
  attendance: [],
  tasks: [],
};

export function loadState(): AppState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    const clients = (parsed.clients ?? []).map((c: Client) => ({
      ...c,
      stage: c.stage ?? (c.sale && c.sale.status !== "none" ? "sold" : "new"),
    }));
    return {
      ...defaultState,
      ...parsed,
      attendance: parsed.attendance ?? [],
      categories: parsed.categories ?? defaultState.categories,
      employees: parsed.employees ?? defaultState.employees,
      forms: parsed.forms ?? [],
      clients,
      tasks: parsed.tasks ?? [],
    };
  } catch {
    return defaultState;
  }
}

export function saveState(state: AppState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("crm-state-update"));
}

export type Session = {
  id: string;
  role: "director" | "employee";
  name: string;
  login?: string;
  isActive?: boolean;
  canAccessDepartments?: boolean;
  canAccessForms?: boolean;
} | null;

export function loadSession(): Session {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Migration: if old session had employeeId but no name, or just missing name
    if (parsed && !parsed.name) {
       parsed.name = parsed.role === "director" ? "Direktor" : "Hodim";
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  if (typeof window === "undefined") return;
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
  window.dispatchEvent(new Event("crm-session-update"));
}

export function useAppState() {
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    const onUpdate = () => setState(loadState());
    window.addEventListener("crm-state-update", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("crm-state-update", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const update = useCallback((updater: (s: AppState) => AppState) => {
    const next = updater(loadState());
    saveState(next);
    setState(next);
  }, []);

  return { state, update };
}

export function useSession() {
  const [session, setSession] = useState<Session>(() => loadSession());
  useEffect(() => {
    const onUpdate = () => setSession(loadSession());
    window.addEventListener("crm-session-update", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("crm-session-update", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);
  return session;
}

export function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Helpers
export function addEmployee(state: AppState, emp: Omit<Employee, "id" | "createdAt">): AppState {
  const newEmp: Employee = { ...emp, id: uid("emp"), createdAt: new Date().toISOString() };
  return { ...state, employees: [...state.employees, newEmp] };
}

export function updateEmployee(state: AppState, id: string, patch: Partial<Employee>): AppState {
  return {
    ...state,
    employees: state.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  };
}

export function deleteEmployee(state: AppState, id: string): AppState {
  return { ...state, employees: state.employees.filter((e) => e.id !== id) };
}

export function addForm(state: AppState, form: Omit<FormTemplate, "id" | "createdAt">): AppState {
  const newForm: FormTemplate = { ...form, id: uid("form"), createdAt: new Date().toISOString() };
  return { ...state, forms: [...state.forms, newForm] };
}

export function updateForm(state: AppState, id: string, patch: Partial<FormTemplate>): AppState {
  return {
    ...state,
    forms: state.forms.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  };
}

export function deleteForm(state: AppState, id: string): AppState {
  return { ...state, forms: state.forms.filter((f) => f.id !== id) };
}

export function addCategory(state: AppState, name: string): AppState {
  const newCat: ClientCategory = { id: uid("cat"), name };
  return { ...state, categories: [...state.categories, newCat] };
}

export function deleteCategory(state: AppState, id: string): AppState {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat || cat.isArchive) return state;
  // move clients of that category to default
  const fallback = state.categories.find((c) => !c.isArchive)?.id ?? "cat-default";
  return {
    ...state,
    categories: state.categories.filter((c) => c.id !== id),
    clients: state.clients.map((cl) => (cl.categoryId === id ? { ...cl, categoryId: fallback } : cl)),
  };
}

export function addClient(state: AppState, client: Omit<Client, "id" | "createdAt" | "notes" | "call" | "stage"> & { stage?: Client["stage"] }): AppState {
  const newClient: Client = {
    ...client,
    stage: client.stage ?? "new",
    id: uid("cl"),
    createdAt: new Date().toISOString(),
    notes: [],
    call: {},
  };
  return { ...state, clients: [newClient, ...state.clients] };
}

export function updateClient(state: AppState, id: string, patch: Partial<Client>): AppState {
  return {
    ...state,
    clients: state.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

export function updateDirector(state: AppState, patch: Partial<Director>): AppState {
  return { ...state, director: { ...state.director, ...patch } };
}

export function addAttendance(
  state: AppState,
  rec: Omit<import("./types").AttendanceRecord, "id">
): AppState {
  const newRec: import("./types").AttendanceRecord = { ...rec, id: uid("att") };
  return { ...state, attendance: [newRec, ...(state.attendance ?? [])] };
}

export function updateAttendance(
  state: AppState,
  id: string,
  patch: Partial<import("./types").AttendanceRecord>
): AppState {
  return {
    ...state,
    attendance: (state.attendance ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
  };
}

export function addTask(
  state: AppState,
  task: Omit<Task, "id" | "createdAt" | "status">
): AppState {
  const newTask: Task = {
    ...task,
    id: uid("task"),
    createdAt: new Date().toISOString(),
    status: "todo",
  };
  return { ...state, tasks: [newTask, ...(state.tasks ?? [])] };
}

export function updateTask(state: AppState, id: string, patch: Partial<Task>): AppState {
  return {
    ...state,
    tasks: (state.tasks ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

export function deleteTask(state: AppState, id: string): AppState {
  return { ...state, tasks: (state.tasks ?? []).filter((t) => t.id !== id) };
}

export function clearSensitiveState() {
  const state = loadState();
  const cleared: AppState = {
    ...state,
    attendance: [],
    clients: [],
    employees: [],
    forms: [],
    tasks: [],
  };
  saveState(cleared);
}
