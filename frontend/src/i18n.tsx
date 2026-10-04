import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ur";

const dictionary = {
  en: {
    "nav.dashboard": "Dashboard",
    "nav.timetable": "Timetable",
    "nav.quizzes": "Quizzes",
    "nav.attendance": "Attendance",
    "nav.admin": "Administration",
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
  },
  ur: {
    "nav.dashboard": "ڈیش بورڈ",
    "nav.timetable": "ٹائم ٹیبل",
    "nav.quizzes": "کوئز",
    "nav.attendance": "حاضری",
    "nav.admin": "انتظامیہ",
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
