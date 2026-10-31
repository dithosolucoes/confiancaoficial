import PayoutRatesSettings from "@/components/PayoutRatesSettings";
import PayoutReport from "@/components/PayoutReport";

const PayoutManagement = () => {
  return (
    <div className="space-y-6">
      <PayoutRatesSettings />
      <PayoutReport />
    </div>
  );
};

export default PayoutManagement;
