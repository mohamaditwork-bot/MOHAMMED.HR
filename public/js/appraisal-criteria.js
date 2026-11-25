// Appraisal criteria per department (shared by the server and the browser).
// Each set: 7–9 criteria, weights total 100, scored 1–5 (points = weight × score / 5).

const ATT = { id: "attendance", ar: "الحضور والانضباط والالتزام بالمواعيد", en: "Attendance & punctuality", w: 10 };
const GROOM = (w = 10) => ({ id: "grooming", ar: "المظهر الشخصي والالتزام بالزي الرسمي", en: "Grooming & uniform standards", w });

export const CRITERIA_SETS = {
  kitchen: {
    ar: "المطبخ", en: "Kitchen",
    criteria: [
      { id: "food_quality", ar: "جودة الطعام وثبات المذاق وطريقة التقديم", en: "Food quality, taste consistency & presentation", w: 15 },
      { id: "recipes", ar: "الالتزام بالوصفات القياسية وأحجام الحصص", en: "Standard recipes & portion control", w: 10 },
      { id: "haccp", ar: "سلامة الغذاء وتطبيق نظام HACCP", en: "Food safety & HACCP compliance", w: 15 },
      { id: "kitchen_hygiene", ar: "نظافة المطبخ وتنظيم منطقة العمل", en: "Kitchen hygiene & station organisation", w: 10 },
      { id: "mise_en_place", ar: "التحضير المسبق وسرعة تجهيز الطلبات", en: "Mise en place & ticket times", w: 10 },
      { id: "cost_waste", ar: "التحكم في التكاليف وتقليل الهدر", en: "Cost control & waste reduction", w: 10 },
      { id: "personal_hygiene", ar: "النظافة الشخصية والزي والشهادة الصحية", en: "Personal hygiene, uniform & health card", w: 10 },
      { id: "teamwork", ar: "التعاون مع فريق الخدمة والعمل الجماعي", en: "Teamwork with the service team", w: 10 },
      ATT,
    ],
  },
  stewarding: {
    ar: "الستيوارد", en: "Stewarding",
    criteria: [
      { id: "utensils", ar: "نظافة الأواني والمعدات وفق المعايير", en: "Cleanliness of utensils & equipment", w: 20 },
      { id: "chemicals", ar: "الاستخدام الآمن للمواد الكيميائية وآلات الغسيل", en: "Safe use of chemicals & dish machines", w: 15 },
      { id: "area_hygiene", ar: "نظافة مناطق العمل والتخلص من النفايات", en: "Area hygiene & waste disposal", w: 15 },
      { id: "breakage", ar: "العناية بالمعدات والحد من الكسر والفقد", en: "Equipment care & breakage control", w: 10 },
      { id: "peak_speed", ar: "سرعة الإنجاز في أوقات الذروة", en: "Speed during peak service", w: 10 },
      { id: "personal_hygiene", ar: "النظافة الشخصية والزي والشهادة الصحية", en: "Personal hygiene, uniform & health card", w: 10 },
      { id: "teamwork", ar: "التعاون مع المطبخ وفريق الخدمة", en: "Teamwork with kitchen & service", w: 10 },
      ATT,
    ],
  },
  fb_service: {
    ar: "الأغذية والمشروبات", en: "Food & Beverage service",
    criteria: [
      { id: "welcome", ar: "استقبال الضيف وجودة الخدمة", en: "Guest welcome & service quality", w: 15 },
      { id: "menu", ar: "المعرفة بقائمة الطعام والمشروبات والبيع الإضافي", en: "Menu knowledge & upselling", w: 10 },
      { id: "speed", ar: "سرعة الخدمة ودقة الطلبات", en: "Service speed & order accuracy", w: 15 },
      { id: "setup", ar: "تجهيز المطعم وترتيبه وفق المعايير", en: "Outlet set-up & standards", w: 10 },
      { id: "food_safety", ar: "سلامة الغذاء والنظافة", en: "Food safety & hygiene", w: 10 },
      { id: "complaints", ar: "التعامل مع ملاحظات الضيوف وشكاواهم", en: "Handling guest feedback & complaints", w: 10 },
      GROOM(),
      { id: "teamwork", ar: "التعاون مع المطبخ والعمل الجماعي", en: "Teamwork with the kitchen", w: 10 },
      ATT,
    ],
  },
  front_office: {
    ar: "المكتب الأمامي", en: "Front Office",
    criteria: [
      { id: "welcome", ar: "الترحيب بالضيوف والانطباع الأول", en: "Guest welcome & first impression", w: 15 },
      { id: "check_in_out", ar: "دقة وسرعة إجراءات الوصول والمغادرة", en: "Check-in / check-out accuracy & speed", w: 15 },
      { id: "pms", ar: "إتقان نظام إدارة الفندق", en: "Hotel system (PMS) proficiency", w: 10 },
      { id: "requests", ar: "التعامل مع طلبات الضيوف وشكاواهم", en: "Handling guest requests & complaints", w: 15 },
      { id: "upselling", ar: "البيع الإضافي وترقية الغرف", en: "Upselling & room upgrades", w: 10 },
      { id: "knowledge", ar: "المعرفة بخدمات الفندق ومعالم المدينة المنورة", en: "Knowledge of hotel services & Madinah", w: 10 },
      { id: "cash", ar: "الدقة في المعاملات المالية والصندوق", en: "Cash & payment accuracy", w: 10 },
      GROOM(5),
      ATT,
    ],
  },
  reservations: {
    ar: "الحجوزات", en: "Reservations",
    criteria: [
      { id: "accuracy", ar: "دقة إدخال الحجوزات وتفاصيلها", en: "Booking accuracy", w: 20 },
      { id: "response", ar: "سرعة الرد على الاستفسارات والطلبات", en: "Response time to enquiries", w: 15 },
      { id: "revenue", ar: "مهارات البيع وتعظيم الإيرادات", en: "Sales skills & revenue optimisation", w: 15 },
      { id: "systems", ar: "إتقان أنظمة الحجز وقنوات البيع", en: "Reservation systems & channels", w: 15 },
      { id: "communication", ar: "التواصل الاحترافي مع الضيوف والجهات", en: "Professional communication", w: 15 },
      { id: "coordination", ar: "التنسيق مع الاستقبال والمبيعات", en: "Coordination with front office & sales", w: 10 },
      ATT,
    ],
  },
  housekeeping: {
    ar: "التدبير الفندقي والمغسلة", en: "Housekeeping & Laundry",
    criteria: [
      { id: "cleaning", ar: "جودة تنظيف الغرف والمرافق وفق المعايير", en: "Room & area cleaning to standard", w: 20 },
      { id: "productivity", ar: "الإنتاجية وإنجاز الغرف المخصصة في الوردية", en: "Productivity — rooms per shift", w: 15 },
      { id: "inspection", ar: "الدقة في التفاصيل ونتائج التفتيش", en: "Attention to detail & inspection results", w: 15 },
      { id: "honesty", ar: "الأمانة والتعامل مع المفقودات", en: "Honesty & lost-and-found handling", w: 10 },
      { id: "privacy", ar: "احترام خصوصية الضيف واللباقة", en: "Guest privacy & courtesy", w: 10 },
      { id: "chemicals", ar: "الاستخدام الآمن للمواد والمعدات والبياضات", en: "Safe use of chemicals, equipment & linen", w: 10 },
      { id: "grooming", ar: "المظهر والنظافة الشخصية", en: "Grooming & personal hygiene", w: 10 },
      ATT,
    ],
  },
  engineering: {
    ar: "الصيانة", en: "Engineering",
    criteria: [
      { id: "technical", ar: "الكفاءة الفنية وجودة الإصلاح", en: "Technical skill & repair quality", w: 20 },
      { id: "response", ar: "سرعة الاستجابة لطلبات الصيانة", en: "Response time to work orders", w: 15 },
      { id: "preventive", ar: "تنفيذ الصيانة الوقائية وفق الجدول", en: "Preventive maintenance on schedule", w: 15 },
      { id: "safety", ar: "الالتزام بإجراءات السلامة ومعدات الحماية", en: "Safety procedures & PPE", w: 15 },
      { id: "guest_areas", ar: "العمل دون إزعاج الضيوف وترك الموقع نظيفًا", en: "No guest disturbance & tidy work area", w: 10 },
      { id: "energy", ar: "ترشيد الطاقة والتكاليف", en: "Energy & cost awareness", w: 5 },
      { id: "tools", ar: "العناية بالأدوات وتوثيق الأعمال", en: "Tools care & job documentation", w: 10 },
      ATT,
    ],
  },
  security: {
    ar: "الأمن والسلامة", en: "Security & Safety",
    criteria: [
      { id: "patrols", ar: "اليقظة والالتزام بجولات التفتيش", en: "Vigilance & patrols", w: 20 },
      { id: "emergency", ar: "الاستجابة للطوارئ والسلامة من الحريق", en: "Emergency & fire response", w: 20 },
      { id: "access", ar: "ضبط الدخول وحماية الضيوف وممتلكاتهم", en: "Access control & guest protection", w: 15 },
      { id: "reports", ar: "دقة التقارير والسجلات", en: "Incident reports & logs", w: 10 },
      { id: "courtesy", ar: "حسن التعامل واللباقة مع الضيوف", en: "Courtesy with guests", w: 10 },
      { id: "integrity", ar: "السرية والأمانة", en: "Confidentiality & integrity", w: 10 },
      GROOM(5),
      ATT,
    ],
  },
  sales: {
    ar: "المبيعات والتسويق", en: "Sales & Marketing",
    criteria: [
      { id: "targets", ar: "تحقيق الأهداف البيعية", en: "Sales targets achievement", w: 25 },
      { id: "accounts", ar: "بناء العلاقات مع العملاء والشركات", en: "Client relationships & accounts", w: 15 },
      { id: "market", ar: "المعرفة بالسوق والمنافسين", en: "Market & competitor knowledge", w: 10 },
      { id: "proposals", ar: "جودة العروض والتواصل", en: "Proposals & communication quality", w: 15 },
      { id: "coordination", ar: "التنسيق مع الإيرادات والحجوزات", en: "Coordination with revenue & reservations", w: 10 },
      { id: "representation", ar: "تمثيل الفندق في الفعاليات والزيارات", en: "Representing the hotel", w: 10 },
      { id: "reporting", ar: "التقارير والمتابعة", en: "Reporting & follow-up", w: 5 },
      ATT,
    ],
  },
  finance: {
    ar: "المالية والمشتريات", en: "Finance & Purchasing",
    criteria: [
      { id: "accuracy", ar: "دقة العمل المالي والمحاسبي", en: "Accuracy of financial work", w: 20 },
      { id: "timeliness", ar: "الالتزام بالمواعيد والإقفال الشهري", en: "Timeliness & month-end close", w: 15 },
      { id: "controls", ar: "الالتزام بالضوابط والسياسات المالية", en: "Financial controls & policies", w: 15 },
      { id: "purchasing", ar: "إدارة الموردين والمشتريات وخفض التكاليف", en: "Suppliers, purchasing & savings", w: 15 },
      { id: "systems", ar: "إتقان الأنظمة وإعداد التقارير", en: "Systems & reporting", w: 10 },
      { id: "confidentiality", ar: "السرية والأمانة", en: "Confidentiality & integrity", w: 10 },
      { id: "internal", ar: "خدمة الأقسام الداخلية", en: "Internal customer service", w: 5 },
      ATT,
    ],
  },
  hr: {
    ar: "الموارد البشرية", en: "Human Resources",
    criteria: [
      { id: "processes", ar: "دقة إجراءات الموظفين والمنصات الحكومية (قوى، مقيم، التأمينات)", en: "HR processes & government platforms (Qiwa, Muqeem, GOSI)", w: 20 },
      { id: "compliance", ar: "الالتزام بنظام العمل وسياسات الفندق", en: "Labour law & policy compliance", w: 15 },
      { id: "followup", ar: "الالتزام بالمواعيد ومتابعة الوثائق والعقود", en: "Timeliness & document follow-up", w: 15 },
      { id: "service", ar: "خدمة الموظفين والتواصل معهم", en: "Employee service & communication", w: 15 },
      { id: "confidentiality", ar: "السرية وحماية البيانات", en: "Confidentiality & data protection", w: 15 },
      { id: "recruitment", ar: "التوظيف ودعم التوطين", en: "Recruitment & Saudization", w: 10 },
      ATT,
    ],
  },
  it: {
    ar: "تقنية المعلومات", en: "Information Technology",
    criteria: [
      { id: "uptime", ar: "استقرار الأنظمة والشبكات", en: "System & network stability", w: 20 },
      { id: "support", ar: "سرعة الاستجابة للدعم الفني", en: "Support response time", w: 20 },
      { id: "security", ar: "أمن المعلومات وحماية البيانات", en: "Information security", w: 15 },
      { id: "guest_systems", ar: "دعم أنظمة الضيوف (الإنترنت، التلفاز، الأقفال)", en: "Guest systems (Wi-Fi, TV, door locks)", w: 15 },
      { id: "documentation", ar: "التوثيق والصيانة الوقائية", en: "Documentation & preventive maintenance", w: 10 },
      { id: "training", ar: "خدمة الأقسام وتدريب المستخدمين", en: "Internal service & user training", w: 10 },
      ATT,
    ],
  },
  leadership: {
    ar: "الإدارة العليا", en: "Senior Management",
    criteria: [
      { id: "results", ar: "تحقيق الأهداف التشغيلية والمالية", en: "Operational & financial results", w: 20 },
      { id: "guest_satisfaction", ar: "رضا الضيوف وجودة الخدمة", en: "Guest satisfaction & service quality", w: 20 },
      { id: "leadership", ar: "قيادة الفريق وتطويره", en: "Leadership & team development", w: 15 },
      { id: "decisions", ar: "اتخاذ القرار وحل المشكلات", en: "Decision making & problem solving", w: 15 },
      { id: "standards", ar: "الالتزام بمعايير العلامة والأنظمة", en: "Brand standards & compliance", w: 10 },
      { id: "saudization", ar: "التوطين وتطوير الكفاءات الوطنية", en: "Saudization & national talent", w: 10 },
      { id: "communication", ar: "التواصل والتنسيق بين الأقسام", en: "Cross-department communication", w: 10 },
    ],
  },
  general: {
    ar: "عام", en: "General",
    criteria: [
      { id: "quality", ar: "جودة العمل ودقته", en: "Quality & accuracy of work", w: 15 },
      { id: "guest", ar: "خدمة الضيوف والعناية بهم", en: "Guest service & care", w: 15 },
      { id: "productivity", ar: "الإنتاجية وإنجاز المهام في وقتها", en: "Productivity & timely completion", w: 15 },
      { id: "procedures", ar: "الالتزام بسياسات الفندق ومعايير الصحة والسلامة", en: "Hotel policies, health & safety", w: 15 },
      { id: "teamwork", ar: "العمل الجماعي والتعاون بين الأقسام", en: "Teamwork & cooperation", w: 10 },
      { id: "initiative", ar: "المبادرة وحل المشكلات", en: "Initiative & problem solving", w: 10 },
      GROOM(),
      ATT,
    ],
  },
};

const norm = (s) => String(s || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();

// Department first, then job-title keywords; "general" when nothing fits.
export function setFor(department, jobTitle) {
  const d = norm(department), j = norm(jobTitle);
  const has = (s, ...words) => words.some((w) => s.includes(norm(w)));
  if (has(d, "ستيوارد", "steward")) return "stewarding";
  if (has(d, "مطبخ", "kitchen", "pastry", "حلويات") || d === "kit") return "kitchen";
  if (has(d, "اغذيه", "مشروبات", "f&b", "food", "restaurant", "مطعم")) return has(j, "chef", "cook", "commis", "طاهي", "طباخ") ? "kitchen" : "fb_service";
  if (has(d, "حجوزات", "reservation")) return "reservations";
  if (has(d, "مكتب الامامي", "استقبال", "front office", "concierge") || d === "fo") return "front_office";
  if (has(d, "تدبير", "housekeeping", "مغسله", "laundry") || d === "hk") return "housekeeping";
  if (has(d, "صيانه", "engineering", "maintenance") || d === "pom" || d === "eng") return "engineering";
  if (has(d, "امن", "سلامه", "security")) return "security";
  if (has(d, "مبيعات", "تسويق", "sales", "marketing", "revenue")) return "sales";
  if (has(d, "ماليه", "مشتريات", "finance", "account", "purchas")) return "finance";
  if (has(d, "موارد", "بشري", "human resources") || d === "hr") return "hr";
  if (has(d, "تقنيه", "information technology") || d === "it") return "it";
  if (has(d, "اداره العليا", "management", "executive")) return "leadership";
  if (has(j, "chef", "cook", "commis", "طاهي", "طباخ")) return "kitchen";
  if (has(j, "steward")) return "stewarding";
  if (has(j, "waiter", "host", "barista", "نادل")) return "fb_service";
  if (has(j, "room", "housekeep", "laundry", "عامل نظافه")) return "housekeeping";
  if (has(j, "technician", "electric", "plumb", "painter", "hvac", "فني")) return "engineering";
  if (has(j, "guest service", "receptionist", "bell", "concierge")) return "front_office";
  return "general";
}

export const totalWeight = (criteria) => criteria.reduce((s, c) => s + c.w, 0);
