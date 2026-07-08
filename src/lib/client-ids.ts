const KEY = "crm_client_ids";

export function getStoredClientIds(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function storeClientId(clientId: string, code: string): void {
  const ids = getStoredClientIds();
  ids[clientId] = code;
  localStorage.setItem(KEY, JSON.stringify(ids));
}

/**
 * Kod validligi: yonma-yon (qo'shni) raqamlar bir xil bo'lmasligi kerak.
 * Istisno: '0' — ketma-ket nollar ruxsat etiladi (boshidagi to'ldiruvchi nollar uchun).
 */
function hasValidAdjacency(numStr: string): boolean {
  for (let i = 0; i < numStr.length - 1; i++) {
    if (numStr[i] === numStr[i + 1] && numStr[i] !== "0") return false;
  }
  return true;
}

/**
 * Keyingi mijoz kodini "OK/8" qoidasi bo'yicha hisoblaydi:
 *  - Doimiy bosh qism: OK/8
 *  - So'ng n xonali son (n = 3 dan boshlanadi), nol bilan to'ldirilgan: 000, 001, ...
 *  - n xonali sonlar tugagach n+1 xonaliga o'tadi (4, 5, ...)
 *  - Yonma-yon raqamlar bir xil bo'lmaydi ('0' istisno)
 *
 * ESLATMA: Asosiy (yagona kafolatlangan) kod backendda
 * `POST /clients/:id/assign-code` orqali beriladi. Bu funksiya faqat
 * zaxira/oldindan ko'rsatish uchun. `takenCodes` berilmasa, localStorage keshi.
 */
export function generateNextClientCode(takenCodes?: Iterable<string>): string | null {
  const taken = new Set<string>(
    takenCodes ? Array.from(takenCodes) : Object.values(getStoredClientIds())
  );

  for (let width = 3; width <= 9; width++) {
    const max = Math.pow(10, width);
    for (let c = 0; c < max; c++) {
      const body = String(c).padStart(width, "0");
      const full = `8${body}`;
      if (!hasValidAdjacency(full)) continue;
      const code = `OK/${full}`;
      if (!taken.has(code)) return code;
    }
  }

  return null;
}

