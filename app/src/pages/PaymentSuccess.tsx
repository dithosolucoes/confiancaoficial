import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Stripe redirects here after a successful payment. The actual database
 * status update is performed server-side by the verified Stripe webhook
 * (`stripe-payment-link-webhook`). This page only displays a confirmation
 * message so that visitors cannot fake a payment by navigating here directly.
 */
const PaymentSuccess = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-8 pb-6 space-y-4">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">{t("payment_success_title")}</h1>
          <p className="text-muted-foreground">{t("payment_success_message")}</p>
          <Button onClick={() => navigate("/dashboard")} className="mt-4">
            {t("back_to_dashboard")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccess;
