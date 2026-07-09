// ─────────────────────────────────────────────────────────────
// Kutubxonasiz (dependency'siz) haqiqiy .xlsx generator.
// Brauzerda ishlaydi: ZIP (STORE) + OOXML + inline stringlar.
// Excel/Sheets to'g'ridan-to'g'ri ochadi — hech qanday ogohlantirishsiz.
// ─────────────────────────────────────────────────────────────

export type CellValue = string | number | null | undefined;

export interface SheetData {
  name: string;
  rows: CellValue[][];
}

// ── CRC32 (ZIP uchun) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Sarlavha varaq nomini Excel qoidalariga moslash (max 31, taqiqlangan belgilarsiz)
function safeSheetName(name: string, idx: number): string {
  const cleaned = (name || `List${idx + 1}`).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return cleaned || `List${idx + 1}`;
}

function colLetter(n: number): string {
  let s = "";
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function isNumeric(v: CellValue): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function sheetXml(rows: CellValue[][]): string {
  let body = "";
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r];
    let row = `<row r="${r + 1}">`;
    for (let c = 0; c < cells.length; c++) {
      const ref = `${colLetter(c)}${r + 1}`;
      const v = cells[c];
      if (v === null || v === undefined || v === "") {
        continue; // bo'sh katak
      }
      if (isNumeric(v)) {
        row += `<c r="${ref}" t="n"><v>${v}</v></c>`;
      } else {
        row += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`;
      }
    }
    row += `</row>`;
    body += row;
  }
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

// ── ZIP (STORE — siqishsiz) ──
interface ZipEntry { name: string; data: Uint8Array; crc: number; offset: number; }

function buildZip(files: { name: string; content: string }[]): Uint8Array {
  const entries: ZipEntry[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const pushBytes = (b: Uint8Array) => { chunks.push(b); offset += b.length; };

  for (const f of files) {
    const data = enc.encode(f.content);
    const nameBytes = enc.encode(f.name);
    const crc = crc32(data);
    const localOffset = offset;

    const header = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, 0x04034b50, true);       // local file header sig
    dv.setUint16(4, 20, true);               // version needed
    dv.setUint16(6, 0, true);                // flags
    dv.setUint16(8, 0, true);                // method = store
    dv.setUint16(10, 0, true);               // mod time
    dv.setUint16(12, 0x21, true);            // mod date (1980-01-01)
    dv.setUint32(14, crc, true);             // crc32
    dv.setUint32(18, data.length, true);     // compressed size
    dv.setUint32(22, data.length, true);     // uncompressed size
    dv.setUint16(26, nameBytes.length, true);// name length
    dv.setUint16(28, 0, true);               // extra length
    header.set(nameBytes, 30);

    pushBytes(header);
    pushBytes(data);
    entries.push({ name: f.name, data, crc, offset: localOffset });
  }

  // Central directory
  const cdStart = offset;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const cd = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true);       // central dir sig
    dv.setUint16(4, 20, true);               // version made by
    dv.setUint16(6, 20, true);               // version needed
    dv.setUint16(8, 0, true);                // flags
    dv.setUint16(10, 0, true);               // method
    dv.setUint16(12, 0, true);               // mod time
    dv.setUint16(14, 0x21, true);            // mod date
    dv.setUint32(16, e.crc, true);           // crc32
    dv.setUint32(20, e.data.length, true);   // compressed size
    dv.setUint32(24, e.data.length, true);   // uncompressed size
    dv.setUint16(28, nameBytes.length, true);// name length
    dv.setUint16(30, 0, true);               // extra length
    dv.setUint16(32, 0, true);               // comment length
    dv.setUint16(34, 0, true);               // disk number start
    dv.setUint16(36, 0, true);               // internal attrs
    dv.setUint32(38, 0, true);               // external attrs
    dv.setUint32(42, e.offset, true);        // local header offset
    cd.set(nameBytes, 46);
    pushBytes(cd);
  }
  const cdSize = offset - cdStart;

  // End of central directory
  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(4, 0, true);
  dv.setUint16(6, 0, true);
  dv.setUint16(8, entries.length, true);
  dv.setUint16(10, entries.length, true);
  dv.setUint32(12, cdSize, true);
  dv.setUint32(16, cdStart, true);
  dv.setUint16(20, 0, true);
  pushBytes(eocd);

  // Birlashtirish
  const out = new Uint8Array(offset);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

// ── Public: bir nechta varaqli .xlsx yaratib, yuklab olish ──
export function downloadXlsx(filename: string, sheets: SheetData[]): void {
  const usedNames = new Set<string>();
  const normSheets = sheets.map((s, i) => {
    let nm = safeSheetName(s.name, i);
    let n = nm, k = 1;
    while (usedNames.has(n.toLowerCase())) { n = `${nm.slice(0, 28)}_${++k}`; }
    usedNames.add(n.toLowerCase());
    return { name: n, rows: s.rows };
  });

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    normSheets.map((_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join("") +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    normSheets.map((s, i) =>
      `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    ).join("") +
    `</sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    normSheets.map((_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    ).join("") +
    `</Relationships>`;

  const files: { name: string; content: string }[] = [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    ...normSheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(s.rows) })),
  ];

  const zip = buildZip(files);
  // Uint8Array'ni mustaqil ArrayBuffer'ga ko'chirib Blob yaratamiz (TS/DOM mos)
  const buf = zip.slice().buffer;
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
