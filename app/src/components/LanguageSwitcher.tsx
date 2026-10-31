import { useTranslation } from "react-i18next";
import { safeStorage } from "@/lib/safeStorage";

const languages = [
  { code: "pt", emoji: "🇵🇹", label: "Português" },
  { code: "en", emoji: "🇬🇧", label: "English" },
  { code: "es", emoji: "🇪🇸", label: "Español" },
];

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    safeStorage.setItem("lang", lang);
  };

  return (
    <div className="flex items-center gap-1">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => changeLanguage(lang.code)}
          title={lang.label}
          className={`text-xl p-1 rounded-md transition-all hover:bg-accent ${
            i18n.language === lang.code
              ? "ring-2 ring-primary/40 scale-110"
              : "opacity-60 hover:opacity-100"
          }`}
        >
          {lang.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
