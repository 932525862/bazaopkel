# Google Sheets-ga forma javoblarini yuborish (To'liq qo'llanma)

Ushbu hujjat sizga public forma orqali kelgan ma'lumotlarni Google Sheets-ga avtomatik yozib borishni qanday tashkil qilishni bosqichma-bosqich ko'rsatadi. Qo'llanma Apps Script veb-ilovasi orqali ishlaydi (server kerak emas), shuningdek xavfsizlik bo'yicha tavsiyalar beradi.

## 1. Tayyor kod (Google Apps Script)
Quyidagi kodni yangi Apps Script loyihasiga joylang (Google Sheets → Extensions → Apps Script):

```js
/** Apps Script: Webhook qabul qiluvchi va Google Sheet ga yozuvchi */
const EXPECTED_SECRET = 'PUT_A_SECRET_HERE'; // bu yerga sirni qo'ying (yoki PropertiesService ishlating)

function doPost(e) {
  try {
    const payload = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};

    // Secret mavjud bo'lsa tekshirish
    if (EXPECTED_SECRET && payload.secret !== EXPECTED_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Invalid secret' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sheetId = 'YOUR_SHEET_ID_HERE'; // bu yerga Google Sheet ID ni qo'ying
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('Sheet1') || ss.getSheets()[0];

    const row = [
      payload.submittedAt || new Date().toISOString(),
      payload.formId || '',
      payload.formTitle || '',
      JSON.stringify(payload.values || {}),
    ];

    sheet.appendRow(row);

    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

- `EXPECTED_SECRET` ga o'zingiz istagan sirli matnni yozing.
- `sheetId` ga Google Sheet ID ni joylang (sheet URL ichida `/d/` va `/edit` orasidagi qism).

### Deploy qilish
1. Apps Script oynasida `Deploy` → `New deployment`
2. `Select type` dan `Web app` ni tanlang.
   - Execute as: `Me`
   - Who has access: `Anyone` (yoki `Anyone with link`)
3. `Deploy` qiling va chiqadigan Web App URL-ni nusxa oling.

## 2. `.env` va ilova tomonga sozlash
Vite ilovangizga quyidagi o'zgaruvchilarni qo'shing (faqat misol, `.env` faylni git ga qo'ymang):

```
VITE_SHEETS_WEBHOOK=https://script.google.com/macros/s/XXXX/exec
VITE_SHEETS_SECRET=some-very-secret-string
```

- `VITE_SHEETS_WEBHOOK` — Apps Script Web App URL
- `VITE_SHEETS_SECRET` — Apps Script dagi `EXPECTED_SECRET` bilan bir xil bo'lishi kerak.

Keyin dev serverni qayta ishga tushiring:

```bash
npm run dev
```

(yoki production uchun `npm run build` va deploy qiling).

## 3. Test qilish (curl)
Apps Script URL olgach, quyidagi curl buyruq bilan sinab ko'ring (agar secret ishlatayotgan bo'lsangiz, `secret` maydonini yuboring):

```bash
curl -X POST 'https://script.google.com/macros/s/XXXXX/exec' \
  -H 'Content-Type: application/json' \
  -d '{
    "formId":"demo-form",
    "formTitle":"Test Forma",
    "values":{"ism":"Ali","telefon":"+998901234567"},
    "submittedAt":"2026-06-06T12:00:00Z",
    "secret":"some-very-secret-string"
  }'
```

Javobda `{"ok":true}` ko'rsangiz, jadvalga satr qo'shilgan bo'ladi.

## 4. Ilovangizdagi kod (allaqachon repo-ga qo'yilgan)
`src/routes/f.$formId.tsx` ichida forma yuborilgach, ilova `VITE_SHEETS_WEBHOOK` manziliga JSON yuboradi. Agar `VITE_SHEETS_SECRET` mavjud bo'lsa, u ham `secret` maydoni sifatida yuboriladi.

Agar siz hozir server-yon dasturni xohlamasangiz, Apps Script + shared secret etarli bo'ladi.

## 5. Xavfsizlik tavsiyalari
- Apps Script `Anyone` bo'lsa, endpoint odatda ochiq. Shu sababli `EXPECTED_SECRET` qo'yish zarur.
- Eng yaxshi yechim: server-side autentifikatsiya (serverda Google Service Account bilan Sheets API orqali yozish). Agar xohlasangiz, men Cloudflare Worker yoki kichik server misolini yozib beraman.

## 6. Qo'shimcha: ustunlar va formatni moslash
Agar jadvalda alohida ustunlarga ajratib yozmoqchi bo'lsangiz, `payload.values` ichidagi maydonlarni Apps Scriptda o'qing va `row` massiviga alohida element sifatida qo'shing. Misol:

```js
const row = [payload.submittedAt, payload.values.ism || '', payload.values.telefon || '', payload.formTitle];
```

Bu yondashuv bilan har bir maydon alohida ustunga yoziladi.

---

Agar xohlasangiz, men hozir `EXPECTED_SECRET` tekshiruvini ham repo ichidagi `docs`ga qo`shdim va `src/routes/f.$formId.tsx` kodiga secret yuborilishini qo'shdim. Endi `.env` ga `VITE_SHEETS_WEBHOOK` va `VITE_SHEETS_SECRET` qo'shing va test qilib ko'ring.
