import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { safeStorage } from "@/lib/safeStorage";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: undefined };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || "Erro desconhecido" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ errorMessage: error?.message || "Erro desconhecido" });
    console.error("Application runtime error:", error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearAndReload = async () => {
    safeStorage.clear();

    try {
      if ("caches" in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }

      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } catch {
      // Ignore cleanup failures and still reload
    }

    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center space-y-4 shadow-sm">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold">Ocorreu um erro ao carregar a página</h1>
          <p className="text-sm text-muted-foreground">
            Tente recarregar. Se persistir, limpe os dados locais para forçar uma atualização completa.
          </p>
          {this.state.errorMessage && (
            <p className="text-xs text-muted-foreground break-all">{this.state.errorMessage}</p>
          )}
          <div className="space-y-2">
            <Button onClick={this.handleReload} className="w-full">
              Recarregar página
            </Button>
            <Button variant="outline" onClick={this.handleClearAndReload} className="w-full">
              Limpar dados e recarregar
            </Button>
          </div>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
