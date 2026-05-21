# تله‌مور (Telemor)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-Mr--Meshky%2Ftelemor-blue?logo=github)](https://github.com/Mr-Meshky/telemor)

یک ربات بله که اکانت تلگرام شما را به بله متصل می‌کند. با تله‌مور می‌توانید پیام‌های تلگرامتان را مستقیماً از داخل بله بخوانید و ارسال کنید.

---

## ویژگی‌ها

- **ورود امن** — فرآیند ۵ مرحله‌ای (API ID، API Hash، شماره تلفن، کد تأیید، رمز دو مرحله‌ای)
- **پیام‌های خصوصی** — مشاهده و ارسال پیام به مخاطبان تلگرام
- **کانال‌ها و گروه‌ها** — مرور پست‌های کانال‌ها و گروه‌هایی که عضو هستید
- **انتقال رسانه** — دریافت و ارسال عکس، ویدئو، صدا و فایل بین بله و تلگرام
- **اعلان‌های آنی** — هنگام دریافت پیام جدید در تلگرام، بله به شما اطلاع می‌دهد
- **ماندگاری session** — بعد از ری‌استارت سرور نیازی به ورود مجدد نیست

---

## پیش‌نیازها

| ابزار | نسخه |
|---|---|
| Node.js | 18 یا بالاتر |
| pnpm | 8 یا بالاتر |

همچنین نیاز دارید:

- **توکن ربات بله** — از `@BotFather` در اپلیکیشن بله بگیرید
- **API Credentials تلگرام** — از [my.telegram.org](https://my.telegram.org) در بخش «API development tools»

---

## نصب و راه‌اندازی

```bash
# ۱. کلون کنید
git clone https://github.com/Mr-Meshky/telemor.git
cd telemor

# ۲. فایل تنظیمات را بسازید
cp .env.example .env
```

فایل `.env` را باز کرده و مقدار `BALE_TOKEN` را با توکن ربات بله‌تان پر کنید:

```env
BALE_TOKEN=your_bale_bot_token_here
```

```bash
# ۳. پکیج‌ها را نصب کنید
pnpm install

# ۴. اجرا کنید
pnpm dev        # حالت توسعه (با hot reload)
# یا
pnpm build && pnpm start   # حالت production
```

---

## نحوه استفاده

۱. ربات را در بله پیدا کنید و `/start` بزنید
۲. روی «اتصال به تلگرام» کلیک کنید
۳. مراحل ورود را طی کنید:
   - **API ID** و **API Hash** از [my.telegram.org](https://my.telegram.org)
   - شماره تلفن تلگرام با فرمت بین‌المللی (مثلاً `+989123456789`)
   - کد تأیید ارسال‌شده توسط تلگرام
   - رمز دو مرحله‌ای (در صورت فعال بودن)
۴. پس از ورود موفق، منوی اصلی نمایش داده می‌شود

---

## ساختار پروژه

```
src/
├── index.ts                  # نقطه ورود — boot و reconnect
├── bot/
│   ├── index.ts              # تعریف ربات بله
│   └── handlers/
│       ├── start.ts          # فرآیند ورود و login flow
│       ├── menu.ts           # منوی اصلی
│       ├── chat.ts           # ارسال/دریافت پیام و رسانه
│       ├── pvList.ts         # لیست پیام‌های خصوصی
│       ├── pvListCache.ts    # کش لیست مخاطبان
│       ├── channels.ts       # لیست کانال‌ها و گروه‌ها
│       └── settings.ts       # تنظیمات و خروج از حساب
├── telegram/
│   ├── client.ts             # مدیریت کلاینت GramJS
│   └── listeners.ts          # listener پیام‌های ورودی تلگرام
├── state/
│   └── index.ts              # state مدیریت و ذخیره روی دیسک
└── utils/
    ├── format.ts             # فرمت‌بندی پیام‌ها و خطاها
    └── pagination.ts         # صفحه‌بندی لیست‌ها
```

---

## تکنولوژی‌ها

| کتابخانه | کاربرد |
|---|---|
| [grammY](https://grammy.dev) | فریم‌ورک ربات بله (سازگار با Telegram Bot API) |
| [GramJS](https://gram.js.org) | کلاینت MTProto تلگرام |
| TypeScript | زبان برنامه‌نویسی |
| dotenv | مدیریت متغیرهای محیطی |

---

## مشارکت در پروژه

خوشحال می‌شیم Pull Request بزنید!

۱. ریپازیتوری را Fork کنید
۲. یک branch جدید بسازید: `git checkout -b feature/ویژگی-جدید`
۳. تغییراتتان را commit کنید
۴. Push کنید و یک PR باز کنید

---

## لایسنس

MIT © 2026 [Mr-Meshky](https://github.com/Mr-Meshky)

استفاده، تغییر و توزیع آزاد است، مشروط به حفظ نام پروژه و متن لایسنس در نسخه‌های مشتق‌شده.
