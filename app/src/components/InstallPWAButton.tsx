import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share } from "lucide-react";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallPWAButtonProps {
  variant?: "default" | "hero" | "compact";
  className?: string;
}

const InstallPWAButton = ({ variant = "default", className = "" }: InstallPWAButtonProps) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [showManualHint, setShowManualHint] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Detect installed (standalone) mode
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as { standalone?: boolean }).standalone));
    setIsInstalled(standalone);

    // Detect iOS (no beforeinstallprompt support)
    const ua = window.navigator.userAgent.toLowerCase();
    const iOS = /iphone|ipad|ipod/.test(ua);
    setIsIOS(iOS);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      toast.success("Aplicação instalada com sucesso!");
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const waitForPrompt = (timeoutMs = 1500): Promise<BeforeInstallPromptEvent | null> =>
    new Promise((resolve) => {
      if (deferredPrompt) return resolve(deferredPrompt);
      let done = false;
      const handler = (e: Event) => {
        e.preventDefault();
        if (done) return;
        done = true;
        const evt = e as BeforeInstallPromptEvent;
        setDeferredPrompt(evt);
        window.removeEventListener("beforeinstallprompt", handler);
        resolve(evt);
      };
      window.addEventListener("beforeinstallprompt", handler);
      setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener("beforeinstallprompt", handler);
        resolve(null);
      }, timeoutMs);
    });

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSHint(true);
      return;
    }
    setInstalling(true);
    try {
      const prompt = deferredPrompt ?? (await waitForPrompt());
      if (!prompt) {
        setShowManualHint(true);
        return;
      }
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") {
        toast.success("A instalar a aplicação...");
        setDeferredPrompt(null);
      }
    } catch {
      setShowManualHint(true);
    } finally {
      setInstalling(false);
    }
  };

  if (isInstalled) return null;

  const sizes =
    variant === "hero"
      ? "lg"
      : variant === "compact"
      ? "sm"
      : "default";

  return (
    <>
      <Button
        size={sizes as any}
        onClick={handleInstall}
        disabled={installing}
        className={`bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all ${
          variant === "hero" ? "animate-pulse-soft font-semibold" : ""
        } ${className}`}
      >
        <Download className="w-4 h-4 mr-2" />
        <span className="hidden sm:inline">{installing ? "A instalar..." : "Instalar aplicação"}</span>
      </Button>

      {showManualHint && (
        <div
          className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowManualHint(false)}
        >
          <div
            className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold text-lg mb-3 text-foreground">
              Instalar a aplicação
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              O seu navegador não permitiu a instalação automática. Siga estes passos:
            </p>
            <ol className="text-sm text-muted-foreground space-y-2 mb-4">
              <li className="flex gap-2">
                <span className="font-semibold text-primary">1.</span>
                <span>Abra o menu do navegador (⋮ no Chrome / Edge)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">2.</span>
                <span>Selecione "Instalar app" ou "Adicionar à tela inicial"</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">3.</span>
                <span>Confirme a instalação</span>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground mb-4">
              Dica: a instalação só é possível em sites publicados via HTTPS e em navegadores compatíveis (Chrome, Edge, Brave, Samsung Internet).
            </p>
            <Button className="w-full" onClick={() => setShowManualHint(false)}>
              Entendi
            </Button>
          </div>
        </div>
      )}

      {showIOSHint && (
        <div
          className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIOSHint(false)}
        >
          <div
            className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold text-lg mb-3 text-foreground">
              Instalar no iPhone / iPad
            </h3>
            <ol className="text-sm text-muted-foreground space-y-2 mb-4">
              <li className="flex gap-2">
                <span className="font-semibold text-primary">1.</span>
                <span>
                  Toque no ícone de partilha <Share className="inline w-4 h-4" /> na barra do
                  Safari
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">2.</span>
                <span>Selecione "Adicionar ao Ecrã Principal"</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">3.</span>
                <span>Toque em "Adicionar"</span>
              </li>
            </ol>
            <Button className="w-full" onClick={() => setShowIOSHint(false)}>
              Entendi
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallPWAButton;
