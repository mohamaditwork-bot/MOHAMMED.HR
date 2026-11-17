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
  "st.expired": "منتهي", "st.near": "قريب الانتهاء", "st.ok": "ساري", "st.none": "بدون تاريخ",
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
  "i.drop": "اسحب الملف هنا أو اختر ملف", "i.done": "تم الاستيراد", "e.title": "تصدير البيانات", "e.desc": "نزّل أي جدول كملف Excel.",
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
  "st.expired": "Expired", "st.near": "Expiring soon", "st.ok": "Valid", "st.none": "No date",
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
  "i.drop": "Drop the file here or choose a file", "i.done": "Import finished", "e.title": "Export data", "e.desc": "Download any table as an Excel file.",
  "set.thresholds": "Alert thresholds (days before expiry)", "set.iqama": "Iqama", "set.contracts": "Contracts", "set.docs": "Other documents",
  "set.autorenew": "Contracts renew automatically every year", "set.emails": "Alert emails (comma separated)", "set.test": "Send alert now",
  "set.email.off": "Email is not enabled yet: add RESEND_API_KEY in the hosting settings.", "set.hotel": "Organization name",
  "set.daily": "A daily alert is sent automatically at 7 AM (Saudi time) for every expired or expiring document.",
  "u.id": "ID number (username)", "u.name": "Name", "u.role": "Role", "u.pw": "Password (empty = ID number)", "u.add": "New user",
  "a.at": "Time", "a.user": "User", "a.action": "Action", "a.entity": "Record",
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
