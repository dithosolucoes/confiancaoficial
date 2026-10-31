import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CustomerDashboard from "@/components/CustomerDashboard";
import TechnicianDashboard from "@/components/TechnicianDashboard";

const Dashboard = () => {
  const { user, profile, loading, profileError, retryProfile, signOut } = useAuth();
  const { t } = useTranslation();

  if (user && !profile && profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold">Não foi possível carregar a sua conta</h1>
          <p className="text-sm text-muted-foreground">
            O serviço está temporariamente indisponível. Tente novamente em alguns instantes.
          </p>
          <p className="text-xs text-muted-foreground break-all">{profileError}</p>
          <div className="space-y-2">
            <Button className="w-full" onClick={retryProfile}>Tentar novamente</Button>
            <Button variant="outline" className="w-full" onClick={() => signOut()}>Sair</Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("loading_text")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // user_type do perfil cobre os 4 papéis; o tipo gerado do Supabase ainda lista só 2.
  const activeRole: string = profile?.user_type || "customer";

  if (activeRole === "gestor") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (activeRole === "company_admin") {
    return <Navigate to="/empresa/dashboard" replace />;
  }

  const renderActiveDashboard = () => {
    if (activeRole === "technician") {
      return <TechnicianDashboard />;
    }
    return <CustomerDashboard />;
  };

  return (
    <div className="min-h-screen bg-background">
      {renderActiveDashboard()}
    </div>
  );
};

export default Dashboard;
