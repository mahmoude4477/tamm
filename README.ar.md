<div dir="rtl" align="center">
  <img src="src/app/icon.svg" width="56" height="56" alt="شعار تم" />
  <h1>تم</h1>
  <p>إدارة مهام ومشاريع الفرق الداخلية.</p>
  <p><a href="docs/operations.md">دليل التشغيل</a> · <a href="https://github.com/mahmoude4477/tamm/issues">الإبلاغ عن مشكلة</a></p>
  <p><a href="README.md"><img src="https://img.shields.io/badge/Read_in_English-315643?style=for-the-badge" alt="Read in English" /></a></p>
  <p>
    <a href="https://github.com/mahmoude4477/tamm/actions/workflows/ci.yml"><img src="https://github.com/mahmoude4477/tamm/actions/workflows/ci.yml/badge.svg" alt="حالة الفحوصات الآلية" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-315643" alt="ترخيص MIT" /></a>
  </p>
</div>

<div dir="rtl">

تم مساحة عمل مفتوحة المصدر تُستضاف على خوادمك لإدارة مشاريع الفريق ومهامه. أسند العمل، وراجع تقدّمه، وتابع عبء العمل بواجهة عربية أو إنجليزية تدعم اتجاه الكتابة تلقائيًا.

يعمل النظام بمحرك جافاسكربت وقاعدة بيانات علائقية على بنيتك التحتية. استخدام الحاويات اختياري.

</div>

Node.js · PostgreSQL · Docker (optional)

<div dir="rtl">

![واجهة إدارة المشاريع والمهام في تم](docs/preview.png)

## الميزات

- **المشاريع ومسارات العمل** — تنظيم المشاريع وتخصيص حالات المهام، مع الأولويات والمهام الفرعية وقوائم التحقق والتبعيات.
- **تنسيق الفريق** — أقسام وفرق، وإسناد المهام، وتوثيق نقلها، ومراجعة العمل قبل اعتماده.
- **طرق عرض مرنة** — لوحة وجدول وتقويم، مع بحث شامل وفلاتر محفوظة وصفحة للمهام الشخصية.
- **التخطيط** — قوالب قابلة لإعادة الاستخدام، ومهام متكررة، ومعالم، وتخطيط الطاقة الاستيعابية الأسبوعية.
- **التعاون** — تعليقات وإشارات للأعضاء ومرفقات ومتابعون وإشعارات.
- **التقارير** — متابعة صحة المشاريع وعبء العمل واتجاهات الإنجاز الشهرية، وتصدير التقارير إلى ملفات جداول أو مستندات.
- **إدارة مساحات العمل** — دعوات وأدوار وصلاحيات وسجل نشاط وأرشيف عبر مساحات عمل متعددة.
- **الحقول والوقت** — حقول مخصصة للمشاريع، ومؤقتات وإدخال يدوي للوقت وتقارير قابلة للتصدير.
- **التكاملات** — مفاتيح للوصول البرمجي وإشعارات أحداث موقعة واشتراكات تقويم، مع مساعد اختياري للصياغة باستخدام مزوّدك.
- **العربية والإنجليزية** — ترجمة مدمجة، واتجاه تلقائي للواجهة، وقواميس نصوص تسهّل إضافة لغات أخرى.

## البدء

المتطلبات:

</div>

**Node.js 22+ · PostgreSQL 16+ · npm**

```bash
git clone https://github.com/mahmoude4477/tamm.git
cd tamm
npm ci
cp .env.example .env.local
```

<div dir="rtl">

في ملف البيئة، اضبط رابط اتصال قاعدة البيانات وعنوان التطبيق المحلي باستخدام المتغيرين التاليين:

</div>

`.env.local`

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
BETTER_AUTH_URL=http://localhost:3000
```

<div dir="rtl">

ولّد سرًا بالأمر التالي، ثم انسخ الناتج إلى متغير سر المصادقة في ملف البيئة:

</div>

`BETTER_AUTH_SECRET`

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

<div dir="rtl">

طبّق ترحيلات قاعدة البيانات وشغّل التطبيق:

</div>

```bash
node --env-file=.env.local node_modules/drizzle-kit/bin.cjs migrate
npm run dev
```

<div dir="rtl">

افتح [التطبيق المحلي](http://localhost:3000) لاستكشاف النسخة التجريبية، أو انتقل إلى [صفحة الدخول](http://localhost:3000/login) لإنشاء حساب. تُحفظ رسائل التطوير في المجلد التالي؛ افتح رابط التحقق من الرسالة، ثم أنشئ مساحة عمل وأضف مشروعًا وادعُ فريقك.

</div>

`.data/mail`

<div dir="rtl">

للنشر وإعداد البريد والعامل اللازم للمهام المتكررة والإشعارات المجدولة، اتبع [دليل التشغيل بالإنجليزية](docs/operations.md).

## التوثيق

| الدليل | المحتوى |
| --- | --- |
| [التشغيل — بالإنجليزية](docs/operations.md) | النشر والإعدادات والمهام المجدولة والملفات والنسخ الاحتياطي |
| [إعداد البريد](docs/smtp.ar.md) | خادم الإرسال والمنفذ والمرسِل وبيانات الدخول وفحص الاتصال |
| [التكاملات — بالإنجليزية](docs/integrations.md) | الواجهة البرمجية والأحداث واشتراكات التقويم والمساعد الاختياري |
| [التطوير](docs/development.ar.md) | بنية المشروع والترجمة وتشغيل الفحوصات |
| [خارطة التطوير](docs/roadmap.ar.md) | العمل المنجز والميزات المخططة |

## التقنيات المستخدمة

</div>

Next.js · React · TypeScript · Tailwind CSS · shadcn/ui with Base UI · Better Auth · PostgreSQL · Drizzle · Zod · TanStack Table

<div dir="rtl">

## المساهمة

نرحّب ببلاغات الأخطاء والترجمات وتحسينات التوثيق والمساهمات البرمجية. افتح [بلاغًا](https://github.com/mahmoude4477/tamm/issues) لشرح مشكلة أو مناقشة ميزة، واقرأ [دليل التطوير](docs/development.ar.md) قبل إرسال طلب دمج.

## الترخيص

ترخيص المشروع والخط المرفق لتصدير المستندات:

</div>

[MIT](LICENSE) · [DejaVu font license](public/fonts/LICENSE-DejaVu.txt)
