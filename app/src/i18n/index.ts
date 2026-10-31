import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import pt from "./locales/pt.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import { safeStorage } from "@/lib/safeStorage";

const savedLang = safeStorage.getItem("lang") || "pt";

i18n.use(initReactI18next).init({
  resources: { pt: { translation: pt }, en: { translation: en }, es: { translation: es } },
  lng: savedLang,
  fallbackLng: "pt",
  interpolation: { escapeValue: false },
});

export default i18n;
