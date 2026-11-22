// Arabic / English texts. t("key") returns the text in the current language.
const AR = {
  app: "منصة الموارد البشرية", hotel: "نوفوتيل المدينة المنورة", hr: "الموارد البشرية والعلاقات الحكومية",
  // navigation
  "nav.main": "الرئيسية", "nav.people": "القوى العاملة", "nav.compliance": "الامتثال والوثائق", "nav.growth": "التوطين والتوظيف",
  "nav.tools": "أدوات", "nav.admin": "الإدارة",
  "p.dashboard": "لوحة القيادة", "p.employees": "الموظفون", "p.labor": "عمالة الشركات", "p.documents": "مركز الوثائق",
  "p.saudization": "التوطين والسعودة", "p.recruitment": "التوظيف", "p.insurance": "التأمين الطبي", "p.dependents": "التابعون",
  "p.tasks": "المتابعات", "p.platforms": "مطابقة المنصات", "p.assistant": "المساعد الذكي", "p.import": "استيراد وتصدير",
  "p.settings": "الإعدادات", "p.users": "المستخدمون", "p.audit": "سجل التغييرات",
  // common
  search: "بحث...", "search.global": "ابحث بالاسم أو رقم الهوية أو الرقم الوظيفي", add: "إضافة", edit: "تعديل", delete: "حذف", save: "حفظ",
  cancel: "إلغاء", close: "إغلاق", print: "طباعة", export: "تصدير Excel", all: "الكل", yes: "نعم", no: "لا", loading: "جاري التحميل...",
  saved: "تم الحفظ", deleted: "تم الحذف", "confirm.delete": "متأكد من حذف هذا السجل؟ لا يمكن التراجع.", none: "لا توجد بيانات",
  results: "نتيجة", of: "من", actions: "إجراءات", details: "التفاصيل", logout: "تسجيل الخروج", "change.password": "تغيير كلمة المرور",
  theme: "الوضع الداكن / الفاتح", lang: "English", "role.admin": "مدير النظام", "role.editor": "محرر", "role.viewer": "مشاهد",
  today: "اليوم", days: "يوم", total: "الإجمالي", open: "فتح", required: "مطلوب", optional: "اختياري", "no.permission": "عرض فقط",
  "print.generated": "تاريخ الطباعة", "print.by": "طُبع بواسطة", "filter.dept": "كل الأقسام", "filter.company": "كل الشركات",
  "filter.status": "كل الحالات", "filter.type": "كل الأنواع", "filter.nat": "كل الجنسيات",
  // statuses
  "st.expired": "منتهي", "st.near": "قريب الانتهاء", "st.ok": "ساري", "st.none": "بدون تاريخ", "st.used": "مستخدمة — عاد",
  "emp.active": "على رأس العمل", "emp.left": "غادر",
  // dashboard
  "k.staff": "الموظفون الدائمون", "k.saudi": "سعوديون", "k.nonsaudi": "غير سعوديين", "k.ratio": "نسبة السعودة", "k.labor": "عمالة الشركات",
  "k.companies": "الشركات المشغلة", "k.workforce": "إجمالي القوى العاملة", "k.expired": "وثائق منتهية", "k.near": "وثائق قريبة الانتهاء",
  "k.nodate": "وثائق بدون تاريخ", "k.openjobs": "وظائف شاغرة", "k.applicants": "متقدمون نشطون", "k.tasks": "متابعات مفتوحة",
  "k.target": "الهدف الداخلي", "k.needed": "سعوديون مطلوبون للهدف",
  "c.saud": "السعودة", "c.dept": "الموظفون حسب القسم", "c.nat": "الجنسيات", "c.docs": "حالة الوثائق", "c.company": "العمالة حسب الشركة",
  "c.funnel": "مراحل التوظيف", "urgent": "تنبيهات عاجلة", "ai.insights": "ملخص ذكي", "ai.generate": "حلّل بالذكاء الاصطناعي",
  // documents
  "doc.type": "نوع الوثيقة", "doc.number": "رقم الوثيقة", "doc.issue": "تاريخ الإصدار", "doc.expiry": "تاريخ الانتهاء", "doc.days": "المتبقي (يوم)",
  "doc.status": "الحالة", "doc.owner": "صاحب الوثيقة", "doc.add": "إضافة وثيقة", "doc.renew": "تجديد",
  // saudization
  "s.overall": "النسبة العامة (الموظفون الدائمون)", "s.bydept": "السعودة حسب القسم", "s.bytitle": "السعودة حسب المسمى الوظيفي",
  "s.rules": "قرارات وقواعد التوطين", "s.rule.add": "إضافة قاعدة", "s.target.set": "الهدف الداخلي للسعودة (%)", "s.need": "المطلوب للهدف",
  "s.sim": "محاكي السعودة", "s.sim.hire": "توظيف سعوديين جدد", "s.sim.replace": "إحلال (سعودي بدل وافد)", "s.sim.result": "النسبة المتوقعة",
  "s.note": "النسبة هنا داخلية محسوبة من بياناتك. الأهداف الرسمية تُدخل كقواعد من مصدر موثّق (وزارة الموارد البشرية / قوى) ولا يخترعها النظام.",
  "s.covered": "المشمولون", "s.compliant": "مطابق", "s.below": "أقل من المطلوب", "s.ai": "تحليل وتوصيات السعودة",
  // recruitment
  "r.jobs": "الوظائف", "r.job.add": "وظيفة جديدة", "r.app.add": "متقدم جديد", "r.pipeline": "مسار المتقدمين", "r.screen": "تقييم بالذكاء الاصطناعي",
  "r.hire": "تعيين كموظف", "r.saudi_only": "للسعوديين فقط", "r.openings": "الشواغر", "r.applicants": "المتقدمون",
  "stage.new": "جديد", "stage.screening": "فرز", "stage.interview": "مقابلة", "stage.offer": "عرض وظيفي", "stage.hired": "تم التعيين", "stage.rejected": "مرفوض",
  "job.open": "مفتوحة", "job.on_hold": "معلّقة", "job.closed": "مغلقة",
  // tasks
  "task.open": "مفتوحة", "task.done": "منجزة", "cat.insurance": "تعديل تأمين", "cat.missing_date": "وثيقة بدون تاريخ", "cat.platform": "مطابقة منصات",
  "cat.general": "عام", "cat.renewal": "تجديد وثيقة",
  // assistant
  "ai.title": "المساعد الذكي للموارد البشرية", "ai.placeholder": "اسأل عن موظفيك، السعودة، الوثائق، التوظيف...",
  "ai.send": "إرسال", "ai.thinking": "يحلل البيانات...", "ai.off": "الذكاء الاصطناعي غير مفعّل بعد. يضيف المدير مفتاح ANTHROPIC_API_KEY في إعدادات الاستضافة.",
  "ai.s1": "لخص لي وضع الموارد البشرية اليوم", "ai.s2": "مين الوثائق اللي لازم أجددها هذا الأسبوع؟", "ai.s3": "كيف أرفع نسبة السعودة في قسم الأغذية والمشروبات؟",
  "ai.s4": "قارن بين الأقسام في عدد الموظفين والسعودة", "ai.privacy": "يُرسل للمساعد ملخص البيانات بدون الآيبان والجوال والبريد والعنوان وتاريخ الميلاد.",
  // import
  "i.title": "استيراد ملف Excel", "i.desc": "ارفع ملف الموظفين والعمالة (نفس صيغة ملفك). يحدّث السجلات الموجودة برقم الهوية ولا يكررها.",
  "i.drop": "اسحب الملفات هنا أو اختر ملف/ملفات (تقدر ترفع كذا ملف مرة وحدة)", "i.types": "يتعرف تلقائيًا على: ملف الموظفين الرئيسي • عقود قوى • Casual • مقيم (المقيمين والتابعين) • الخروج والعودة • الإقامات المجددة • تغيير المهن • الخروج النهائي • نقل الخدمات", "i.main": "ملف الموظفين الرئيسي", "i.report": "تقرير وش تغيّر", "i.done": "تم الاستيراد", "e.title": "تصدير البيانات", "e.desc": "نزّل أي جدول كملف Excel.",
  // settings
  "set.thresholds": "حدود التنبيه (أيام قبل الانتهاء)", "set.iqama": "الإقامة", "set.contracts": "العقود", "set.docs": "باقي الوثائق",
  "set.autorenew": "العقود تتجدد تلقائيًا كل سنة", "set.emails": "إيميلات التنبيه (افصل بفاصلة)", "set.test": "أرسل التنبيه الآن",
  "set.email.off": "البريد غير مفعّل بعد: أضف RESEND_API_KEY في إعدادات الاستضافة.", "set.hotel": "اسم المنشأة",
  "set.daily": "يُرسل تنبيه يومي تلقائيًا الساعة 7 صباحًا (بتوقيت السعودية) لكل وثيقة منتهية أو قريبة.",
  // users
  "u.id": "رقم الهوية (اسم المستخدم)", "u.name": "الاسم", "u.role": "الصلاحية", "u.pw": "كلمة المرور (فاضية = رقم الهوية)", "u.add": "مستخدم جديد",
  // audit
  "a.at": "الوقت", "a.user": "المستخدم", "a.action": "الإجراء", "a.entity": "السجل",
  // idle / login
  "p.appraisals": "التقييم وتجديد العقود", "apr.new": "تقييم جديد", "apr.none": "لا توجد تقييمات", "apr.period": "فترة التقييم", "apr.manager": "المدير المباشر", "apr.mtitle": "منصب المدير", "apr.score": "النتيجة", "apr.decision": "قرار العقد", "apr.sendmgr": "رابط المدير", "apr.sendemp": "رابط الموظف", "apr.view": "عرض / PDF", "apr.pdf": "طباعة / حفظ PDF", "apr.copy": "نسخ الرابط", "apr.copied": "تم النسخ", "apr.email": "إيميل", "apr.open": "فتح", "apr.renew": "رابط جديد", "apr.expires": "صلاحية الرابط حتى", "apr.linkhelp": "أرسل الرابط — يفتح بدون تسجيل دخول، ويوقّع بإصبعه من الجوال. الرابط شخصي وسري.", "apr.create": "إنشاء وإرسال الرابط", "apr.flow": "الخطوات: المدير يقيّم ويحدد قرار تجديد العقد ويوقّع ← بعدها رابط للموظف يطّلع ويوقّع ← يرجع النموذج محفوظ هنا وفي ملف الموظف مع PDF.", "apr.desc": "تقييم أداء وقرار تجديد عقد بتوقيع إلكتروني من المدير والموظف", "apr.t.all": "الكل", "apr.t.open": "قيد التوقيع", "apr.t.done": "مكتملة", "p.leaves": "الإجازات", "p.movements": "الحركات الوظيفية", "p.reports": "مركز التقارير",
  "lv.annual": "سنوية", "lv.sick": "مرضية", "lv.emergency": "اضطرارية", "lv.unpaid": "بدون راتب", "lv.hajj": "حج", "lv.maternity": "أمومة", "lv.other": "أخرى",
  "ls.pending": "بانتظار الموافقة", "ls.approved": "معتمدة", "ls.rejected": "مرفوضة",
  "lv.add": "طلب إجازة", "lv.visa": "تأشيرة الخروج والعودة", "lv.visaok": "التأشيرة تغطي", "lv.visano": "التأشيرة لا تغطي", "lv.balance": "أرصدة الإجازات", "lv.list": "سجل الإجازات", "lv.entitled": "الاستحقاق السنوي", "lv.used": "المستخدم هذه السنة", "lv.remaining": "المتبقي",
  "lv.ontoday": "في إجازة اليوم", "lv.pendingk": "طلبات بانتظار الموافقة", "lv.daysyear": "أيام إجازة معتمدة هذه السنة", "approve": "اعتماد", "reject": "رفض",
  "mv.promotion": "ترقية", "mv.transfer": "نقل قسم", "mv.salary": "تعديل راتب", "mv.title": "تغيير مسمى", "mv.contract": "تجديد عقد", "mv.warning": "إنذار", "mv.termination": "إنهاء خدمة", "mv.resignation": "استقالة", "mv.other": "أخرى",
  "mv.add": "حركة جديدة", "files": "المرفقات", "file.upload": "رفع ملف (PDF أو صورة)", "file.open": "فتح", "file.none": "لا توجد مرفقات",
  "quick.add": "إضافة سريعة", "welcome.morning": "صباح الخير", "welcome.evening": "مساء الخير", "welcome.sub": "هذي نظرة سريعة على الموارد البشرية اليوم",
  "empty.title": "ما فيه بيانات للحين", "empty.desc": "ارفع ملف الإكسل حق الموظفين والعمالة وتطلع كل البيانات والتحليلات مباشرة.", "empty.go": "ارفع ملف الإكسل",
  "rep.title": "مركز التقارير", "rep.desc": "تقارير رسمية جاهزة للطباعة أو الحفظ PDF بترويسة نوفوتيل.", "rep.open": "عرض التقرير", "rep.back": "رجوع للتقارير",
  "rep.saud": "تقرير السعودة", "rep.saud.d": "النسبة العامة وحسب القسم والمطلوب للهدف",
  "rep.docs": "الوثائق المنتهية والقريبة", "rep.docs.d": "كل وثيقة منتهية أو قريبة الانتهاء مرتبة بالأولوية",
  "rep.staff": "الموظفون حسب القسم", "rep.staff.d": "قائمة الموظفين مجمعة بالأقسام",
  "rep.payroll": "كشف الرواتب", "rep.payroll.d": "الأساسي والسكن والنقل والإجمالي والبنك",
  "rep.leaves": "تقرير الإجازات", "rep.leaves.d": "الأرصدة والإجازات المعتمدة هذه السنة",
  "rep.labor": "عمالة الشركات", "rep.labor.d": "العمالة حسب الشركة مع حالة الإقامة وأجير",
  "rep.prepared": "أعدّه", "rep.date": "التاريخ", "rep.sign": "التوقيع", "rep.total": "الإجمالي", "actions.view": "الملف",
  "login.title": "تسجيل الدخول", "login.id": "رقم الهوية / الإقامة", "login.pw": "كلمة المرور", "login.go": "دخول", "login.idle": "تم قفل الصفحة بعد 30 دقيقة بدون نشاط — سجّل الدخول مرة ثانية",
};

const EN = {
  app: "HR Platform", hotel: "Novotel Al Madinah", hr: "Human Resources & Government Relations",
  "nav.main": "Overview", "nav.people": "Workforce", "nav.compliance": "Compliance & documents", "nav.growth": "Localization & hiring",
  "nav.tools": "Tools", "nav.admin": "Administration",
  "p.dashboard": "Dashboard", "p.employees": "Employees", "p.labor": "Contractor workers", "p.documents": "Documents center",
  "p.saudization": "Saudization", "p.recruitment": "Recruitment", "p.insurance": "Medical insurance", "p.dependents": "Dependents",
  "p.tasks": "Follow-ups", "p.platforms": "Platform matching", "p.assistant": "AI assistant", "p.import": "Import & export",
  "p.settings": "Settings", "p.users": "Users", "p.audit": "Audit log",
  search: "Search...", "search.global": "Search by name, ID number or employee number", add: "Add", edit: "Edit", delete: "Delete", save: "Save",
  cancel: "Cancel", close: "Close", print: "Print", export: "Export Excel", all: "All", yes: "Yes", no: "No", loading: "Loading...",
  saved: "Saved", deleted: "Deleted", "confirm.delete": "Delete this record? This cannot be undone.", none: "No data",
  results: "results", of: "of", actions: "Actions", details: "Details", logout: "Sign out", "change.password": "Change password",
  theme: "Dark / light mode", lang: "العربية", "role.admin": "Administrator", "role.editor": "Editor", "role.viewer": "Viewer",
  today: "Today", days: "days", total: "Total", open: "Open", required: "Required", optional: "Optional", "no.permission": "View only",
  "print.generated": "Printed on", "print.by": "Printed by", "filter.dept": "All departments", "filter.company": "All companies",
  "filter.status": "All statuses", "filter.type": "All types", "filter.nat": "All nationalities",
  "st.expired": "Expired", "st.near": "Expiring soon", "st.ok": "Valid", "st.none": "No date", "st.used": "Used — returned",
  "emp.active": "Active", "emp.left": "Left",
  "k.staff": "Permanent staff", "k.saudi": "Saudis", "k.nonsaudi": "Non-Saudis", "k.ratio": "Saudization", "k.labor": "Contractor workers",
  "k.companies": "Supply companies", "k.workforce": "Total workforce", "k.expired": "Expired documents", "k.near": "Expiring soon",
  "k.nodate": "Documents without date", "k.openjobs": "Open positions", "k.applicants": "Active applicants", "k.tasks": "Open follow-ups",
  "k.target": "Internal target", "k.needed": "Saudis needed for target",
  "c.saud": "Saudization", "c.dept": "Staff by department", "c.nat": "Nationalities", "c.docs": "Document status", "c.company": "Workers by company",
  "c.funnel": "Hiring pipeline", "urgent": "Urgent alerts", "ai.insights": "AI summary", "ai.generate": "Analyse with AI",
  "doc.type": "Document", "doc.number": "Number", "doc.issue": "Issue date", "doc.expiry": "Expiry date", "doc.days": "Days left",
  "doc.status": "Status", "doc.owner": "Holder", "doc.add": "Add document", "doc.renew": "Renew",
  "s.overall": "Overall ratio (permanent staff)", "s.bydept": "Saudization by department", "s.bytitle": "Saudization by job title",
  "s.rules": "Localization rules", "s.rule.add": "Add rule", "s.target.set": "Internal Saudization target (%)", "s.need": "Needed for target",
  "s.sim": "Saudization simulator", "s.sim.hire": "Hire new Saudis", "s.sim.replace": "Replace (Saudi for expat)", "s.sim.result": "Projected ratio",
  "s.note": "This is an internal ratio computed from your data. Official targets are entered as rules from a documented source (MHRSD / Qiwa); the system never invents them.",
  "s.covered": "Covered", "s.compliant": "Compliant", "s.below": "Below requirement", "s.ai": "Saudization analysis & recommendations",
  "r.jobs": "Jobs", "r.job.add": "New job", "r.app.add": "New applicant", "r.pipeline": "Applicant pipeline", "r.screen": "AI screening",
  "r.hire": "Hire as employee", "r.saudi_only": "Saudis only", "r.openings": "Openings", "r.applicants": "Applicants",
  "stage.new": "New", "stage.screening": "Screening", "stage.interview": "Interview", "stage.offer": "Offer", "stage.hired": "Hired", "stage.rejected": "Rejected",
  "job.open": "Open", "job.on_hold": "On hold", "job.closed": "Closed",
  "task.open": "Open", "task.done": "Done", "cat.insurance": "Insurance change", "cat.missing_date": "Document without date", "cat.platform": "Platform matching",
  "cat.general": "General", "cat.renewal": "Document renewal",
  "ai.title": "HR AI assistant", "ai.placeholder": "Ask about your staff, Saudization, documents, hiring...",
  "ai.send": "Send", "ai.thinking": "Analysing your data...", "ai.off": "AI is not enabled yet. The administrator adds ANTHROPIC_API_KEY in the hosting settings.",
  "ai.s1": "Summarize today's HR situation", "ai.s2": "Which documents must be renewed this week?", "ai.s3": "How can we raise Saudization in Food & Beverage?",
  "ai.s4": "Compare departments by headcount and Saudization", "ai.privacy": "The assistant receives a data summary without IBANs, phones, emails, addresses or birth dates.",
  "i.title": "Import Excel file", "i.desc": "Upload the staff & workers workbook (same format as yours). Existing records are updated by ID number, never duplicated.",
  "i.drop": "Drop files here or choose one or more files", "i.types": "Auto-detects: main staff workbook • Qiwa contracts • Casual list • Muqeem residents & dependents • exit/re-entry • renewed iqamas • profession changes • final exit • service transfers", "i.main": "Main staff workbook", "i.report": "What changed", "i.done": "Import finished", "e.title": "Export data", "e.desc": "Download any table as an Excel file.",
  "set.thresholds": "Alert thresholds (days before expiry)", "set.iqama": "Iqama", "set.contracts": "Contracts", "set.docs": "Other documents",
  "set.autorenew": "Contracts renew automatically every year", "set.emails": "Alert emails (comma separated)", "set.test": "Send alert now",
  "set.email.off": "Email is not enabled yet: add RESEND_API_KEY in the hosting settings.", "set.hotel": "Organization name",
  "set.daily": "A daily alert is sent automatically at 7 AM (Saudi time) for every expired or expiring document.",
  "u.id": "ID number (username)", "u.name": "Name", "u.role": "Role", "u.pw": "Password (empty = ID number)", "u.add": "New user",
  "a.at": "Time", "a.user": "User", "a.action": "Action", "a.entity": "Record",
  "p.appraisals": "Appraisals & renewals", "apr.new": "New appraisal", "apr.none": "No appraisals", "apr.period": "Period", "apr.manager": "Line manager", "apr.mtitle": "Manager title", "apr.score": "Score", "apr.decision": "Contract decision", "apr.sendmgr": "Manager link", "apr.sendemp": "Employee link", "apr.view": "View / PDF", "apr.pdf": "Print / save PDF", "apr.copy": "Copy link", "apr.copied": "Copied", "apr.email": "Email", "apr.open": "Open", "apr.renew": "New link", "apr.expires": "Link valid until", "apr.linkhelp": "Send the link — it opens without login and can be signed with a finger on a phone. The link is private.", "apr.create": "Create & send link", "apr.flow": "Flow: the manager rates, decides on renewal and signs → the employee reviews and signs → the signed form is saved here and in the employee file, with PDF.", "apr.desc": "Performance appraisal and contract renewal with e-signatures from manager and employee", "apr.t.all": "All", "apr.t.open": "Awaiting signature", "apr.t.done": "Completed", "p.leaves": "Leaves", "p.movements": "Job movements", "p.reports": "Reports center",
  "lv.annual": "Annual", "lv.sick": "Sick", "lv.emergency": "Emergency", "lv.unpaid": "Unpaid", "lv.hajj": "Hajj", "lv.maternity": "Maternity", "lv.other": "Other",
  "ls.pending": "Pending approval", "ls.approved": "Approved", "ls.rejected": "Rejected",
  "lv.add": "Leave request", "lv.visa": "Exit/re-entry visa", "lv.visaok": "visa covers", "lv.visano": "visa does not cover", "lv.balance": "Leave balances", "lv.list": "Leave log", "lv.entitled": "Annual entitlement", "lv.used": "Used this year", "lv.remaining": "Remaining",
  "lv.ontoday": "On leave today", "lv.pendingk": "Pending requests", "lv.daysyear": "Approved leave days this year", "approve": "Approve", "reject": "Reject",
  "mv.promotion": "Promotion", "mv.transfer": "Department transfer", "mv.salary": "Salary change", "mv.title": "Title change", "mv.contract": "Contract renewal", "mv.warning": "Warning", "mv.termination": "Termination", "mv.resignation": "Resignation", "mv.other": "Other",
  "mv.add": "New movement", "files": "Attachments", "file.upload": "Upload file (PDF or image)", "file.open": "Open", "file.none": "No attachments",
  "quick.add": "Quick add", "welcome.morning": "Good morning", "welcome.evening": "Good evening", "welcome.sub": "Here is today's HR overview",
  "empty.title": "No data yet", "empty.desc": "Upload the staff & workers Excel file and every page and analysis fills in instantly.", "empty.go": "Upload Excel file",
  "rep.title": "Reports center", "rep.desc": "Official reports ready to print or save as PDF with the Novotel letterhead.", "rep.open": "View report", "rep.back": "Back to reports",
  "rep.saud": "Saudization report", "rep.saud.d": "Overall and per-department ratio and hires needed for target",
  "rep.docs": "Expired & expiring documents", "rep.docs.d": "Every expired or expiring document, most urgent first",
  "rep.staff": "Staff by department", "rep.staff.d": "Staff list grouped by department",
  "rep.payroll": "Payroll sheet", "rep.payroll.d": "Basic, housing, transport, total and bank",
  "rep.leaves": "Leave report", "rep.leaves.d": "Balances and approved leave this year",
  "rep.labor": "Contractor workers", "rep.labor.d": "Workers by company with iqama and Ajeer status",
  "rep.prepared": "Prepared by", "rep.date": "Date", "rep.sign": "Signature", "rep.total": "Total", "actions.view": "File",
  "login.title": "Sign in", "login.id": "ID / Iqama number", "login.pw": "Password", "login.go": "Sign in", "login.idle": "The page was locked after 30 minutes of inactivity — please sign in again",
};

// Field labels
const F = {
  name_ar: ["الاسم بالعربي", "Name (Arabic)"], name_en: ["الاسم بالإنجليزي", "Name (English)"], emp_no: ["الرقم الوظيفي", "Employee no."],
  id_no: ["رقم الهوية / الإقامة", "ID / Iqama no."], nationality: ["الجنسية", "Nationality"], gender: ["الجنس", "Gender"],
  birth_date: ["تاريخ الميلاد", "Birth date"], mobile: ["الجوال", "Mobile"], email: ["البريد الإلكتروني", "Email"],
  national_address: ["العنوان الوطني", "National address"], sector: ["القطاع", "Division"], department: ["القسم", "Department"],
  job_title: ["المسمى الوظيفي", "Job title"], iqama_job: ["المهنة في الإقامة", "Iqama profession"], qiwa_job: ["المهنة في قوى", "Qiwa profession"],
  join_date: ["تاريخ الالتحاق", "Join date"], start_date: ["تاريخ المباشرة", "Start date"], grade: ["الدرجة", "Grade"],
  leave_days: ["الإجازة السنوية (يوم)", "Annual leave (days)"], basic_salary: ["الراتب الأساسي", "Basic salary"], housing: ["السكن", "Housing"],
  transport: ["النقل", "Transport"], total_salary: ["إجمالي الراتب", "Total salary"], bank: ["البنك", "Bank"], iban: ["الآيبان", "IBAN"],
  qualification: ["المؤهل", "Qualification"], specialty: ["التخصص", "Specialty"], experience: ["سنوات الخبرة", "Experience"],
  gosi: ["التأمينات", "GOSI"], company: ["الشركة", "Company"], work_hours: ["ساعات العمل", "Work hours"], status: ["الحالة", "Status"],
  notes: ["ملاحظات", "Notes"], kind: ["النوع", "Type"],
  employee_id: ["الموظف", "Employee"], doc_type: ["نوع الوثيقة", "Document type"], number: ["رقم الوثيقة", "Number"],
  issue_date: ["تاريخ الإصدار", "Issue date"], expiry_date: ["تاريخ الانتهاء", "Expiry date"],
  name: ["الاسم", "Name"], iqama_no: ["رقم الإقامة", "Iqama no."], relation: ["الصلة", "Relation"], passport_expiry: ["انتهاء الجواز", "Passport expiry"],
  member_name: ["اسم المؤمن عليه", "Member name"], class: ["الفئة", "Class"], member_no: ["رقم العضوية", "Member no."],
  category: ["التصنيف", "Category"], title: ["العنوان", "Title"], person: ["الشخص", "Person"], details: ["التفاصيل", "Details"], due_date: ["تاريخ الاستحقاق", "Due date"],
  openings: ["عدد الشواغر", "Openings"], saudi_only: ["للسعوديين فقط", "Saudis only"], salary_range: ["نطاق الراتب", "Salary range"], description: ["الوصف والمتطلبات", "Description & requirements"],
  job_id: ["الوظيفة", "Job"], stage: ["المرحلة", "Stage"], rating: ["التقييم (1-5)", "Rating (1-5)"], source: ["المصدر", "Source"],
  expected_salary: ["الراتب المتوقع", "Expected salary"], cv_text: ["السيرة الذاتية (نص)", "CV (text)"], ai_summary: ["تقييم الذكاء الاصطناعي", "AI evaluation"],
  occupations: ["المهن المشمولة (افصل بفاصلة)", "Covered occupations (comma separated)"], required_pct: ["النسبة المطلوبة %", "Required %"],
  effective_date: ["تاريخ التطبيق", "Effective date"],
  leave_type: ["نوع الإجازة", "Leave type"], end_date: ["تاريخ النهاية", "End date"], days: ["عدد الأيام", "Days"],
  move_type: ["نوع الحركة", "Movement type"], move_date: ["تاريخ الحركة", "Date"], outside_ksa: ["خارج المملكة؟ (ينشئ/يطابق تأشيرة خروج وعودة)", "Outside KSA? (syncs exit/re-entry visa)"], from_value: ["من", "From"], to_value: ["إلى", "To"],
};

let lang = "ar";
try { lang = localStorage.getItem("hr_lang") === "en" ? "en" : "ar"; } catch {}

export const getLang = () => lang;
export function setLang(l) {
  lang = l === "en" ? "en" : "ar";
  try { localStorage.setItem("hr_lang", lang); } catch {}
  applyLang();
}
export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}
export const t = (k) => (lang === "en" ? EN : AR)[k] ?? AR[k] ?? k;
export const f = (k) => (F[k] ? F[k][lang === "en" ? 1 : 0] : k);
