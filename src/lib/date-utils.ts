import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/uz-latn";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale("uz-latn");
// We avoid setting a default timezone globally to prevent unpredictable parsing behavior.
// Instead, we explicitly use .tz() on a UTC-anchored dayjs object.

const MONTHS_UZ = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"
];

const WEEKDAYS_UZ = [
  "Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"
];

const WEEKDAYS_SHORT_UZ = [
  "Yak", "Du", "Se", "Chor", "Pay", "Ju", "Sha"
];

/**
 * Returns a dayjs object with UTC+5 offset (Tashkent / Asia/Tashkent).
 * Uses explicit utcOffset instead of IANA timezone to avoid bundle issues.
 */
export function getTashkentDayjs(date?: string | Date | number) {
  if (!date) return dayjs.utc().utcOffset(300);  // UTC+5 = 300 minutes

  // Always parse as UTC first, then shift to UTC+5 (Tashkent).
  // This avoids dependency on the IANA timezone database which may not be available in the browser bundle.
  return dayjs.utc(date).utcOffset(300);
}

/**
 * Formats a date string or object to Uzbek long format: "18 May, 2026"
 */
export function formatUzDate(date: string | Date, options: { includeYear?: boolean; includeWeekday?: boolean; shortWeekday?: boolean } = {}) {
  const d = getTashkentDayjs(date);
  if (!d.isValid()) return "—";

  const day = d.date();
  const month = MONTHS_UZ[d.month()];
  const year = d.year();

  let res = `${day} ${month}`;
  if (options.includeYear) res += `, ${year}`;

  if (options.includeWeekday) {
    const wdIndex = d.day();
    const wd = options.shortWeekday ? WEEKDAYS_SHORT_UZ[wdIndex] : WEEKDAYS_UZ[wdIndex];
    res += ` (${wd})`;
  }

  return res;
}

/**
 * Formats a YYYY-MM string to Uzbek: "May, 2026"
 */
export function formatUzMonth(ym: string) {
  if (!ym || !ym.includes("-")) return ym;
  const [y, m] = ym.split("-");
  const monthIdx = parseInt(m, 10) - 1;
  return `${MONTHS_UZ[monthIdx]} ${y}`;
}

/**
 * Formats a date to "18 May" (bold) and "Dushanba" (small)
 */
export function formatUzDateTable(date: string | Date) {
  const d = getTashkentDayjs(date);
  if (!d.isValid()) return { main: "—", sub: "—" };

  return {
    main: `${d.date()} ${MONTHS_UZ[d.month()]}`,
    sub: WEEKDAYS_UZ[d.day()]
  };
}

/**
 * Translates internal status codes to Uzbek
 */
export function formatUzStatus(status: string) {
  if (!status) return "—";
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    new: "Yangi",
    todo: "Yangi",
    in_progress: "Jarayonda",
    pending: "Tekshiruvda",
    done: "Bajarildi",
    approved: "Bajarildi",
    rejected: "Rad etildi",
    incomplete: "Bajarilmadi",
  };
  return map[s] || status;
}

/**
 * Formats date and time: "18 May, 22:57"
 */
export function formatUzDateTime(date: string | Date) {
  const d = getTashkentDayjs(date);
  if (!d.isValid()) return "—";

  const day = d.date();
  const month = MONTHS_UZ[d.month()];
  const hour = d.format("HH");
  const minute = d.format("mm");

  return `${day} ${month}, ${hour}:${minute}`;
}

/**
 * Formats time in Tashkent timezone (GMT+5)
 */
export function formatUzTime(date: string | Date | number) {
  const d = getTashkentDayjs(date);
  if (!d.isValid()) return "—";
  return d.format("HH:mm");
}
