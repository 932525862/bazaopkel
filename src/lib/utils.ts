import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUzbekPhone(value: string | undefined | null) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  let formatted = "+";
  let cur = digits;

  if (cur.startsWith("998")) {
    formatted += "998";
    cur = cur.slice(3);
  } else if ("998".startsWith(cur)) {
    return "+" + cur;
  } else {
    formatted += "998";
  }

  if (cur.length > 0) formatted += " " + cur.slice(0, 2);
  if (cur.length > 2) formatted += " " + cur.slice(2, 5);
  if (cur.length > 5) formatted += " " + cur.slice(5, 7);
  if (cur.length > 7) formatted += " " + cur.slice(7, 9);

  return formatted;
}
