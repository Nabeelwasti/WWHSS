import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ur";

const dictionary = {
  en: {
    "nav.dashboard": "Dashboard",
    "nav.timetable": "Timetable",
    "nav.quizzes": "Quizzes",
    "nav.attendance": "Attendance",
    "nav.admin": "Administration",
    "nav.parent": "Parent Portal",
    "common.loading": "Loading…",
    "common.signOut": "Sign out",
    "login.subtitle": "Sign in with your school account.",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign in",
    "login.submitting": "Signing in…",
    "home.schoolName": "Workers Welfare Higher Secondary School",
    "home.login": "Student / Staff login",
    "home.notices": "Notices",
    "home.events": "Upcoming events",
    "home.noNotices": "No public notices posted yet.",
    "home.noEvents": "No upcoming events posted yet.",
    "dash.welcome": "Welcome",
    "dash.myClasses": "My classes",
    "progress.title": "My progress",
    "progress.streak": "Day streak",
    "progress.best": "Best streak",
    "progress.attended": "Days attended",
    "progress.rate": "Attendance",
    "progress.msg.none": "Your attendance will show up here once your teacher starts marking it.",
    "progress.msg.10": "Amazing consistency — you've been here every day. Keep it going!",
    "progress.msg.5": "Great streak! Showing up every day is the biggest step to learning.",
    "progress.msg.1": "Good to see you here. Every day you come builds your streak.",
    "progress.msg.0": "Every day is a fresh start. Come in tomorrow and start a new streak!",
    "finance.title": "Finance & Fees",
    "finance.invoices": "Fee Invoices",
    "finance.amountDue": "Amount Due",
    "finance.status": "Status",
    "finance.pay": "Pay",
    "library.title": "Library Catalog",
    "library.search": "Search Books",
    "library.available": "Available",
    "library.borrowed": "Borrowed",
    "exams.title": "Exam Results",
    "exams.marks": "Marks Obtained",
    "exams.grade": "Grade",
    "assignments.title": "Assignments & Homework",
    "assignments.due": "Due Date",
    "assignments.submit": "Submit",
    "timetable.title": "Weekly Timetable",
    "timetable.day": "Day",
    "timetable.time": "Time Slot",
    "quizzes.title": "Quizzes & Assessments",
    "quizzes.start": "Start Quiz",
    "attendance.mark": "Mark Attendance",
    "attendance.title": "Mark attendance",
    "attendance.status": "Status",
    "attendance.present": "Present",
    "attendance.absent": "Absent",
    "attendance.late": "Late",
    "password.change": "Change Password",
    "password.current": "Current Password",
    "password.new": "New Password",
    "ai.assistant": "Campus AI Assistant",
    "ai.placeholder": "Ask anything about school...",
    "ai.send": "Send",
    "notifications.title": "Notifications",
    "update.ready": "A new version is ready.",
    "update.refresh": "Refresh",
    "lang.switchTo": "اردو",

    // Comprehensive extended keys
    "admin.title": "Administration",
    "admin.createUser": "Create a user",
    "admin.fullName": "Full name",
    "admin.email": "Email",
    "admin.create": "Create",
    "admin.assignRole": "Assign a role",
    "admin.selectUser": "Select user",
    "admin.selectRole": "Select role",
    "admin.noScope": "No class scope (school-wide)",
    "admin.assign": "Assign",
    "admin.createClass": "Create a class",
    "admin.className": "e.g. Grade 10",
    "admin.academicYearId": "Academic year ID",
    "admin.currentUsers": "Current users",
    "admin.resetPassword": "Reset password",
    "admin.active": "Active",
    "admin.deactivated": "Deactivated",
    "admin.name": "Name",
    "admin.roles": "Roles",
    "admin.status": "Status",

    "attendance.selectClass": "Select class",
    "attendance.selectSection": "Select section",
    "attendance.rollNum": "Roll #",
    "attendance.name": "Name",
    "attendance.save": "Save attendance",
    "attendance.saving": "Saving…",
    "attendance.excused": "Excused",

    "assignments.myAssignments": "My assignments",
    "assignments.graded": "Graded",
    "assignments.awaiting": "Submitted, awaiting grade",
    "assignments.submitting": "Submitting…",
    "assignments.noAssignments": "No assignments yet.",

    "exams.myResults": "My results",
    "exams.exam": "Exam",
    "exams.subject": "Subject",
    "exams.noResults": "No results recorded yet.",

    "finance.fees": "Fees",
    "finance.fee": "Fee",
    "finance.dueDate": "Due date",
    "finance.noInvoices": "No invoices issued yet.",

    "library.header": "Library",
    "library.placeholder": "Search books…",
    "library.noBooks": "No matching books found.",
    "library.myLoans": "My current & past loans",
    "library.noLoans": "No borrowing history yet.",
    "library.returned": "returned",
    "library.due": "due",

    "password.sectionTitle": "Change password",
    "password.btn": "Change my password",
    "password.repeatNew": "Repeat new password",
    "password.cancel": "Cancel",

    "notifications.header": "Notifications",
    "notifications.empty": "No notifications yet.",

    "ai.title": "Campus AI",
    "ai.askPlaceholder": "Ask a general academic question…",
    "ai.askBtn": "Ask",
    "ai.consentLabel": "Let the assistant see my own real attendance streak and recent results, to give more personal answers.",

    "quizzes.completed": "Completed",
    "quizzes.takeQuiz": "Take quiz",
    "quizzes.submitQuiz": "Submit quiz",
    "quizzes.backToQuizzes": "Back to quizzes",
    "quizzes.scoreMsg": "Your real, server-computed score:",

    "timetable.header": "Timetable",
    "timetable.noPeriods": "No periods scheduled yet.",

    "days.sunday": "Sunday",
    "days.monday": "Monday",
    "days.tuesday": "Tuesday",
    "days.wednesday": "Wednesday",
    "days.thursday": "Thursday",
    "days.friday": "Friday",
    "days.saturday": "Saturday",
    "parent.title": "Parent Portal",
    "parent.subtitle": "View your linked child’s real school information.",
    "parent.child": "Child",
    "parent.noChildren": "No linked children were found.",
    "parent.attendance": "Attendance",
    "parent.results": "Results",
    "parent.fees": "Fees",
    "parent.timetable": "Timetable",
    "parent.notices": "Notices",
    "parent.recentRecords": "recent records",
    "parent.none": "No records yet.",

  },
  ur: {
    "nav.dashboard": "ڈیش بورڈ",
    "nav.timetable": "ٹائم ٹیبل",
    "nav.quizzes": "کوئز",
    "nav.attendance": "حاضری",
    "nav.admin": "انتظامیہ",
    "nav.parent": "والدین پورٹل",
    "common.loading": "لوڈ ہو رہا ہے…",
    "common.signOut": "لاگ آؤٹ",
    "login.subtitle": "اپنے اسکول اکاؤنٹ سے لاگ اِن کریں۔",
    "login.email": "ای میل",
    "login.password": "پاس ورڈ",
    "login.submit": "لاگ اِن",
    "login.submitting": "لاگ اِن ہو رہا ہے…",
    "home.schoolName": "ورکرز ویلفیئر ہائیر سیکنڈری اسکول",
    "home.login": "طلبہ / اسٹاف لاگ اِن",
    "home.notices": "نوٹس",
    "home.events": "آنے والی تقریبات",
    "home.noNotices": "ابھی کوئی عوامی نوٹس نہیں لگایا گیا۔",
    "home.noEvents": "ابھی کوئی آنے والی تقریب درج نہیں۔",
    "dash.welcome": "خوش آمدید",
    "dash.myClasses": "میری کلاسیں",
    "progress.title": "میری پیش رفت",
    "progress.streak": "مسلسل دن",
    "progress.best": "بہترین سلسلہ",
    "progress.attended": "حاضر دن",
    "progress.rate": "حاضری",
    "progress.msg.none": "آپ کی حاضری یہاں اس وقت نظر آئے گی جب آپ کے استاد اسے درج کرنا شروع کریں گے۔",
    "progress.msg.10": "شاندار تسلسل — آپ روزانہ آئے ہیں۔ اسے جاری رکھیں!",
    "progress.msg.5": "بہت خوب! روزانہ آنا سیکھنے کی طرف سب سے بڑا قدم ہے۔",
    "progress.msg.1": "آپ کو یہاں دیکھ کر اچھا لگا۔ ہر دن کی حاضری آپ کا سلسلہ بڑھاتی ہے۔",
    "progress.msg.0": "ہر دن ایک نیا آغاز ہے۔ کل آئیں اور نیا سلسلہ شروع کریں!",
    "finance.title": "مالیات اور فیس",
    "finance.invoices": "فیس کے انوائس",
    "finance.amountDue": "قابل ادا رقم",
    "finance.status": "حیثیت",
    "finance.pay": "ادائیگی کریں",
    "library.title": "لائبریری کیٹلاگ",
    "library.search": "کتابیں تلاش کریں",
    "library.available": "دستیاب",
    "library.borrowed": "مستعار",
    "exams.title": "امتحانی نتائج",
    "exams.marks": "حاصل کردہ نمبر",
    "exams.grade": "گریڈ",
    "assignments.title": "اسائنمنٹس اور ہوم ورک",
    "assignments.due": "آخری تاریخ",
    "assignments.submit": "جمع کرائیں",
    "timetable.title": "ہفتہ وار ٹائم ٹیبل",
    "timetable.day": "دن",
    "timetable.time": "وقت",
    "quizzes.title": "کوئز اور جائزے",
    "quizzes.start": "کوئز شروع کریں",
    "attendance.mark": "حاضری لگائیں",
    "attendance.title": "حاضری لگائیں",
    "attendance.status": "حیثیت",
    "attendance.present": "حاضر",
    "attendance.absent": "غیر حاضر",
    "attendance.late": "تاخیر",
    "password.change": "پاس ورڈ تبدیل کریں",
    "password.current": "موجودہ پاس ورڈ",
    "password.new": "نیا پاس ورڈ",
    "ai.assistant": "کیمپس اے آئی اسسٹنٹ",
    "ai.placeholder": "اسکول کے بارے میں کچھ بھی پوچھیں...",
    "ai.send": "بھیجیں",
    "notifications.title": "اطلاعات",
    "update.ready": "ایک نیا ورژن دستیاب ہے۔",
    "update.refresh": "تازہ کریں",
    "lang.switchTo": "English",

    // Comprehensive extended keys
    "admin.title": "انتظامیہ",
    "admin.createUser": "صارف بنائیں",
    "admin.fullName": "پورا نام",
    "admin.email": "ای میل",
    "admin.create": "تخلیق کریں",
    "admin.assignRole": "عہدہ تفویض کریں",
    "admin.selectUser": "صارف منتخب کریں",
    "admin.selectRole": "عہدہ منتخب کریں",
    "admin.noScope": "اسکول کے تمام امور کے لیے",
    "admin.assign": "تفویض کریں",
    "admin.createClass": "کلاس بنائیں",
    "admin.className": "مثلاً دسویں جماعت",
    "admin.academicYearId": "تعلیمی سال کا آئی ڈی",
    "admin.currentUsers": "موجودہ صارفین",
    "admin.resetPassword": "پاس ورڈ ری سیٹ کریں",
    "admin.active": "فعال",
    "admin.deactivated": "غیر فعال",
    "admin.name": "نام",
    "admin.roles": "عہدے",
    "admin.status": "حیثیت",

    "attendance.selectClass": "کلاس منتخب کریں",
    "attendance.selectSection": "سیکشن منتخب کریں",
    "attendance.rollNum": "رول نمبر",
    "attendance.name": "نام",
    "attendance.save": "حاضری محفوظ کریں",
    "attendance.saving": "محفوظ ہو رہا ہے…",
    "attendance.excused": "رخصت",

    "assignments.myAssignments": "میرے اسائنمنٹس",
    "assignments.graded": "نمبر دیے گئے",
    "assignments.awaiting": "جمع شدہ، نمبروں کا انتظار ہے",
    "assignments.submitting": "جمع ہو رہا ہے…",
    "assignments.noAssignments": "ابھی کوئی اسائنمنٹ نہیں ہے۔",

    "exams.myResults": "میرے نتائج",
    "exams.exam": "امتحان",
    "exams.subject": "مضمون",
    "exams.noResults": "ابھی کوئی نتیجہ درج نہیں ہوا۔",

    "finance.fees": "فیسیں",
    "finance.fee": "فیس",
    "finance.dueDate": "آخری تاریخ",
    "finance.noInvoices": "ابھی کوئی فیس چالان جاری نہیں ہوا۔",

    "library.header": "لائبریری",
    "library.placeholder": "کتابیں تلاش کریں…",
    "library.noBooks": "کوئی بھی کتاب نہیں ملی۔",
    "library.myLoans": "میری مستعار کتابیں",
    "library.noLoans": "ابھی کوئی تاریخچہ نہیں ہے۔",
    "library.returned": "واپس کر دی",
    "library.due": "واپسی کی تاریخ",

    "password.sectionTitle": "پاس ورڈ تبدیل کریں",
    "password.btn": "اپنا پاس ورڈ تبدیل کریں",
    "password.repeatNew": "نیا پاس ورڈ دوبارہ درج کریں",
    "password.cancel": "منسوخ کریں",

    "notifications.header": "اطلاعات",
    "notifications.empty": "ابھی کوئی اطلاع نہیں ہے۔",

    "ai.title": "کیمپس اے آئی",
    "ai.askPlaceholder": "عام تعلیمی سوال پوچھیں…",
    "ai.askBtn": "پوچھیں",
    "ai.consentLabel": "اسسٹنٹ کو میری اپنی حاضری اور نتائج دیکھنے کی اجازت دیں تاکہ وہ بہتر جواب دے سکے۔",

    "quizzes.completed": "مکمل",
    "quizzes.takeQuiz": "کوئز دیں",
    "quizzes.submitQuiz": "کوئز جمع کریں",
    "quizzes.backToQuizzes": "واپس کوئز پر جائیں",
    "quizzes.scoreMsg": "آپ کا حاصل کردہ اسکور:",

    "timetable.header": "ٹائم ٹیبل",
    "timetable.noPeriods": "ابھی کوئی پیریڈ نہیں لگایا گیا۔",

    "days.sunday": "اتوار",
    "days.monday": "پیر",
    "days.tuesday": "منگل",
    "days.wednesday": "بدھ",
    "days.thursday": "جمعرات",
    "days.friday": "جمعہ",
    "days.saturday": "ہفتہ",
    "parent.title": "والدین پورٹل",
    "parent.subtitle": "اپنے منسلک بچے کی حقیقی اسکول معلومات دیکھیں۔",
    "parent.child": "بچہ",
    "parent.noChildren": "کوئی منسلک بچہ نہیں ملا۔",
    "parent.attendance": "حاضری",
    "parent.results": "نتائج",
    "parent.fees": "فیس",
    "parent.timetable": "ٹائم ٹیبل",
    "parent.notices": "نوٹس",
    "parent.recentRecords": "حالیہ ریکارڈ",
    "parent.none": "ابھی کوئی ریکارڈ نہیں۔",

  },
} as const;

export type TranslationKey = keyof (typeof dictionary)["en"];

type LanguageState = { lang: Lang; setLang: (l: Lang) => void; t: (key: TranslationKey) => string };
const LanguageContext = createContext<LanguageState | null>(null);

const STORAGE_KEY = "wwhs-language";

function initialLanguage(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ur") return saved;
  } catch {
    // Storage can be blocked (private mode, strict settings) — English is a safe default.
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
  }, [lang]);

  function setLang(next: Lang) {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Harmless storage failure catch
    }
  }

  const t = (key: TranslationKey) => dictionary[lang][key];

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}

export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();
  return (
    <button onClick={() => setLang(lang === "en" ? "ur" : "en")} aria-label="Change language">
      {t("lang.switchTo")}
    </button>
  );
}
