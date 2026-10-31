import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/hooks/useAuth";

// Cada página carrega só quando é aberta (bundle menor, primeira tela mais rápida).
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const NotFound = lazy(() => import("./pages/NotFound"));
const About = lazy(() => import("./pages/About"));
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const AdminDashboardPage = lazy(() => import("./modules/admin/pages/AdminDashboardPage"));
const AdminServicesPage = lazy(() => import("./modules/admin/pages/AdminServicesPage"));
const AdminAgendaPage = lazy(() => import("./modules/admin/pages/AdminAgendaPage"));
const AdminBudgetingPage = lazy(() => import("./modules/admin/pages/AdminBudgetingPage"));
const AdminCompaniesPage = lazy(() => import("./modules/admin/pages/AdminCompaniesPage"));
const AdminTechniciansPage = lazy(() => import("./modules/admin/pages/AdminTechniciansPage"));
const AdminClientsPage = lazy(() => import("./modules/admin/pages/AdminClientsPage"));
const AdminFinancialPage = lazy(() => import("./modules/admin/pages/AdminFinancialPage"));
const AdminPayoutsPage = lazy(() => import("./modules/admin/pages/AdminPayoutsPage"));
const AdminSuppliersPage = lazy(() => import("./modules/admin/pages/AdminSuppliersPage"));
const AdminMileagePage = lazy(() => import("./modules/admin/pages/AdminMileagePage"));
const AdminAuditPage = lazy(() => import("./modules/admin/pages/AdminAuditPage"));
const AdminSettingsPage = lazy(() => import("./modules/admin/pages/AdminSettingsPage"));
const CompanyLayout = lazy(() => import("./layouts/CompanyLayout"));
const CompanyDashboardPage = lazy(() => import("./modules/company/pages/CompanyDashboardPage"));
const CompanyServicesPage = lazy(() => import("./modules/company/pages/CompanyServicesPage"));
const CompanyTeamPage = lazy(() => import("./modules/company/pages/CompanyTeamPage"));
const CompanyFinancialPage = lazy(() => import("./modules/company/pages/CompanyFinancialPage"));

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Index />} />
            <Route path="/about" element={<About />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />

            {/* Admin Master Portal */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="servicos" element={<AdminServicesPage />} />
              <Route path="agenda" element={<AdminAgendaPage />} />
              <Route path="orcamentos" element={<AdminBudgetingPage />} />
              <Route path="empresas" element={<AdminCompaniesPage />} />
              <Route path="tecnicos" element={<AdminTechniciansPage />} />
              <Route path="clientes" element={<AdminClientsPage />} />
              <Route path="financeiro" element={<AdminFinancialPage />} />
              <Route path="payouts" element={<AdminPayoutsPage />} />
              <Route path="fornecedores" element={<AdminSuppliersPage />} />
              <Route path="deslocamento" element={<AdminMileagePage />} />
              <Route path="auditoria" element={<AdminAuditPage />} />
              <Route path="configuracoes" element={<AdminSettingsPage />} />
            </Route>

            {/* Partner Contractor Portal */}
            <Route path="/empresa" element={<CompanyLayout />}>
              <Route index element={<Navigate to="/empresa/dashboard" replace />} />
              <Route path="dashboard" element={<CompanyDashboardPage />} />
              <Route path="chamados" element={<CompanyServicesPage />} />
              <Route path="equipe" element={<CompanyTeamPage />} />
              <Route path="financeiro" element={<CompanyFinancialPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
