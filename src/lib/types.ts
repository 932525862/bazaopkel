export type Role = "director" | "employee";

export interface Director {
  name: string;
  login: string;
  password: string;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  login: string;
  password: string;
  isActive: boolean;
  canAccessDepartments: boolean;
  canAccessForms: boolean;
  canEditWarehouseArchive?: boolean;
  createdAt: string;
}

export type FieldType = "text" | "phone" | "select" | "textarea" | "radio" | "checkbox" | "multi_select";

export interface FormFieldConfig {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  options?: string[];
}

export interface FormTemplate {
  id: string;
  title: string;
  fields: FormFieldConfig[];
  targetCategoryId: string;
  createdAt: string;
}

export interface ClientCategory {
  id: string;
  name: string;
  isArchive?: boolean;
}

export interface ClientNote {
  id: string;
  text: string;
  authorName: string;
  authorRole: Role;
  createdAt: string;
}

export interface ClientCallStatus {
  inCallByEmployeeId?: string;
  inCallByName?: string;
  startedAt?: string;
  remindAt?: string; // ISO datetime
}

export interface PaymentEntry {
  id: string;
  amount: number;
  authorName: string;
  authorRole: Role;
  createdAt: string;
}

export type SaleStatus = "none" | "partial" | "full";

export interface SaleInfo {
  status: SaleStatus;
  totalAmount?: number; // expected total
  additionalPrice?: number; // upsell amount
  payments: PaymentEntry[];
  nextPaymentAt?: string; // ISO datetime when remainder is due
  soldAt?: string;
  completedAt?: string; // when fully paid
  completedByName?: string;
  completedByRole?: Role;
  telegramReminderSentAt?: string; // when 1h-before reminder was sent
}

export type ClientStage = "new" | "no_answer" | "talked" | "sold";

export interface Client {
  id: string;
  name: string;
  phone: string;
  formId: string;
  formTitle: string;
  categoryId: string;
  stage: ClientStage;
  data: Record<string, string>;
  notes: ClientNote[];
  call: ClientCallStatus;
  sale?: SaleInfo;
  telegramId?: string;
  telegramUsername?: string;
  createdAt: string;
  description?: string;
  clientCode?: string;
}

export type AttendanceStatus = 'PRESENT' | 'ATTENDED' | 'ABSENT';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  checkInAt: string; // ISO datetime
  checkOutAt?: string; // ISO datetime
  date: string; // YYYY-MM-DD
  photo?: string; // check-in photo URL
  checkOutPhoto?: string; // check-out photo URL
  status?: AttendanceStatus; // PRESENT | ATTENDED | ABSENT
  isAutoCheckout?: boolean;
}

export type TaskStatus = "todo" | "in_progress" | "pending" | "done" | "approved" | "rejected" | "incomplete";

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string; // ID of employee
  notifyAt: string;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  templateId: string;
  completionDescription?: string;
  completionLink?: string;
  rejectionReason?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  approvedAt?: string;
  seenByEmployee?: boolean;
  seenByDirector?: boolean;
}

export interface AppState {
  director: Director;
  employees: Employee[];
  forms: FormTemplate[];
  categories: ClientCategory[];
  clients: Client[];
  attendance: AttendanceRecord[];
  tasks: Task[];
}
