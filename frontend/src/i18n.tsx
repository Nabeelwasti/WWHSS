import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// English / Urdu, with right-to-left layout for Urdu. Chosen because many
// parents in the school community read Urdu far more comfortably than
// English, even though the school teaches in English — a language barrier
// is one of the quiet reasons families stay disengaged.
//
// HONEST SCOPE: the wording below covers the screens families see first
// (navigation, sign-in, public homepage, dashboard shell, "My progress").
// Other screens are still English-only. The Urdu was written by an AI and
// should be reviewed by a native speaker (ideally a teacher at the school)
// before launch — tone and word choice matter for a school's voice.

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

  // Keep the page's reading direction and language in sync, so browsers,
  // screen readers and text selection all behave correctly for Urdu.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
  }, [lang]);

  function setLang(next: Lang) {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is harmless.
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
