# MOHAMMED.HR — منصة الموارد البشرية | HR Platform
نوفوتيل المدينة المنورة — Novotel Al Madinah

منصة تحكم كاملة للموارد البشرية: موظفون وعمالة شركات، وثائق وتنبيهات، تأمين طبي، تابعون، مطابقة المنصات، متابعات،
التوطين والسعودة، التوظيف، مساعد ذكاء اصطناعي (Claude)، تنبيهات بريد يومية، عربي/إنجليزي، داكن/فاتح، وطباعة رسمية.

- **لا توجد أي بيانات موظفين في هذا المستودع.** البيانات في قاعدة بيانات Postgres، ولا تُرسل إلا بعد تسجيل الدخول.
- الصلاحيات: **مدير** (كل شيء + المستخدمين والإعدادات) / **محرر** (إضافة وتعديل وحذف) / **مشاهد** (عرض فقط). كل تعديل يُسجَّل في سجل التغييرات.
- قفل تلقائي بعد 30 دقيقة بدون نشاط، وقفل الدخول 15 دقيقة بعد 5 محاولات خاطئة.

## الإعداد على Vercel
1. **Storage → Create Database → Neon (Postgres)** → Connect للمشروع (يضيف `DATABASE_URL`). الجداول تُنشأ تلقائيًا.
2. **Settings → Environment Variables**:
   | المتغير | الغرض |
   |---|---|
   | `SESSION_SECRET` | نص عشوائي طويل (32+ حرف) لتوقيع الجلسات — **مطلوب** |
   | `HR_USERS_SEED` | المستخدمون الأوليون `[{id,name,role,hash}]` (كلمات مرور مشفّرة PBKDF2) — **مطلوب أول مرة** |
   | `ANTHROPIC_API_KEY` | مفتاح Claude من console.anthropic.com — للمساعد الذكي |
   | `RESEND_API_KEY` | مفتاح من resend.com — لتنبيهات البريد |
   | `ALERT_FROM` | (اختياري) المرسل، مثل `HR <hr@yourdomain.com>` بعد توثيق الدومين في Resend |
   | `CRON_SECRET` | نص عشوائي — يحمي التنبيه اليومي التلقائي |
   | `SITE_URL` | (اختياري) رابط الموقع ليظهر زر في رسالة البريد |
3. **Redeploy**، ثم ادخل بحساب المدير → **استيراد وتصدير** → ارفع ملف الإكسل.
4. من **الإعدادات** أضف إيميلات التنبيه وجرّب «أرسل التنبيه الآن». التنبيه اليومي يعمل تلقائيًا 7 صباحًا بتوقيت السعودية (`vercel.json → crons`).

## البنية
- `public/` — الواجهة (`index.html` الدخول، `app.html` المنصة، `js/app.js`، `js/i18n.js` اللغات، `js/logic.js` قواعد العمل المشتركة، `css/app.css`، `vendor/` ECharts وSheetJS).
- `api/handler.js` — دالة Vercel لكل `/api/*`.
- `src/routes.js` — الـ API (دخول، جداول CRUD، استيراد، إعدادات، ذكاء، تنبيهات، سجل).
- `src/schema.js` — الجداول والأعمدة المسموح تعديلها. `src/db.js` — Postgres (Neon) أو PGlite للتجربة المحلية.
- `src/importer.js` — استيراد ملف الإكسل (مطابقة بالاسم، تحديث بدل التكرار).
- `src/ai.js` — المساعد (Claude Opus 5.5) بملخص بيانات بدون الآيبان والجوال والبريد والعنوان وتاريخ الميلاد.
- `src/alerts.js` — رسائل التنبيه (Resend).

## Notes (English)
Vanilla JS front end (no build step), Vercel serverless API, Neon Postgres, Claude for the assistant, Resend for email.
Saudization figures are internal ratios computed from the data; official targets are only shown when HR enters them as rules with a source.
