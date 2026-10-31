import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import logoConfianca from "@/assets/logo-confianca-simple.png";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import InstallPWAButton from "@/components/InstallPWAButton";
import { useNavigate } from "react-router-dom";

interface AppHeaderProps {
  hideLanguageSwitcher?: boolean;
  hideLogo?: boolean;
  rightContent?: ReactNode;
}

const AppHeader = ({ hideLanguageSwitcher = false, hideLogo = false, rightContent }: AppHeaderProps) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
            {!hideLogo && <img src={logoConfianca} alt="Confiança Manutenção" className="h-10 sm:h-14 w-auto object-contain" />}
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <InstallPWAButton variant="compact" />
          {!hideLanguageSwitcher && <LanguageSwitcher />}
          {rightContent}
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span>{profile?.full_name || t("user_label")}</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-accent text-accent-foreground font-medium">
              {profile?.user_type === "technician" ? t("technician") : t("customer")}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-1" />
            {t("sign_out")}
          </Button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
