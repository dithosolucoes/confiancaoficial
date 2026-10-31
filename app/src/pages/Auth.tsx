import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { User, Mail, Lock, Eye, EyeOff, Phone, Home, MapPin, FileText, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import logoConfianca from "@/assets/logo-confianca-simple.png";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { safeStorage } from "@/lib/safeStorage";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState(() => safeStorage.getItem("remembered_email") || "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [billingName, setBillingName] = useState("");
  const [billingNif, setBillingNif] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [localidade, setLocalidade] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  // Technician-specific fields
  const [surname, setSurname] = useState("");
  const [iban, setIban] = useState("");
  const [ibanConfirm, setIbanConfirm] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [sameName, setSameName] = useState(false);
  const [sameAddress, setSameAddress] = useState(false);
  const [userType, setUserType] = useState<"customer" | "technician" | "gestor">("customer");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!safeStorage.getItem("remembered_email"));
  const [forgotPassword, setForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSameNameToggle = (checked: boolean) => {
    setSameName(checked);
    if (checked) setBillingName(fullName);
    else setBillingName("");
  };

  const handleSameAddressToggle = (checked: boolean) => {
    setSameAddress(checked);
    if (checked) setBillingAddress(address);
    else setBillingAddress("");
  };

  // Keep billing fields in sync when "same" is toggled
  const handleFullNameChange = (val: string) => {
    setFullName(val);
    if (sameName) setBillingName(val);
  };

  const handleAddressChange = (val: string) => {
    setAddress(val);
    if (sameAddress) setBillingAddress(val);
  };

  const handlePostalCodeChange = (val: string) => {
    setPostalCode(val);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(t("reset_email_sent"));
      setForgotPassword(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (rememberMe) {
          safeStorage.setItem("remembered_email", email);
        } else {
          safeStorage.removeItem("remembered_email");
        }
        // Cleanup any legacy stored password from older versions
        safeStorage.removeItem("remembered_password");
        toast.success(t("login_success"));
        navigate("/dashboard");
      } else {
        // Technician-specific validation
        if (userType === "technician") {
          if (!surname.trim() || !address.trim() || !iban.trim() || !phone.trim() || !emergencyContact.trim()) {
            toast.error(t("auth_err_tech_required"));
            setLoading(false);
            return;
          }
          if (iban.trim() !== ibanConfirm.trim()) {
            toast.error(t("auth_err_iban_mismatch"));
            setLoading(false);
            return;
          }
        }

        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              user_type: userType,
              phone: phone || "",
              surname: surname || "",
              address: address || "",
              postal_code: postalCode || "",
              localidade: localidade || "",
              address_complement: addressComplement || "",
              billing_name: sameName ? fullName : billingName,
              billing_nif: billingNif || "",
              billing_address: sameAddress ? address : billingAddress,
              iban: iban || "",
              emergency_contact: emergencyContact || "",
            },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;

        supabase.functions.invoke("send-welcome-email", {
          body: { customerName: fullName, customerEmail: email },
        }).catch((err) => console.warn("Welcome email not sent:", err));

        toast.success(t("account_created"));
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const isCustomerSignup = !isLogin && userType === "customer";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="fixed top-4 left-4 z-50">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} title="Home">
          <Home className="w-5 h-5" />
        </Button>
      </div>
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-lg animate-fade-in">
        <div className="text-center mb-8">
          <img src={logoConfianca} alt="Confiança Reparações" className="h-72 w-auto mx-auto mb-4" />
          <p className="text-muted-foreground mt-1">{t("repairs")}</p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="font-display">
              {forgotPassword ? t("forgot_password") : isLogin ? t("login") : t("create_account")}
            </CardTitle>
            <CardDescription>
              {forgotPassword ? t("forgot_password_desc") : isLogin ? t("login_desc") : t("register_desc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {forgotPassword ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("loading_wait") : t("send_reset_link")}
                </Button>
                <div className="text-center">
                  <button type="button" onClick={() => setForgotPassword(false)} className="text-sm text-primary hover:underline">
                    {t("back_to_login")}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {!isLogin && (
                    <>
                      {/* Personal Info Section */}
                      <div className="space-y-3">
                         <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border pb-2">
                          <User className="w-4 h-4 text-primary" />
                          {t("personal_info")}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="name">{t("full_name")}</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input id="name" placeholder={t("your_name")} value={fullName} onChange={(e) => handleFullNameChange(e.target.value)} className="pl-9" required />
                          </div>
                        </div>
                        {userType === "customer" && (
                          <div className="space-y-2">
                            <Label>{t("billing_nif")}</Label>
                            <div className="relative">
                              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder={t("billing_nif_placeholder")} value={billingNif} onChange={(e) => setBillingNif(e.target.value)} className="pl-9" />
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="phone">{t("phone")}</Label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input id="phone" placeholder="" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-9" />
                          </div>
                        </div>
                      </div>

                      {/* Account Type */}
                      <div className="space-y-2">
                        <Label>{t("account_type")}</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setUserType("customer")}
                            className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                              userType === "customer"
                                ? "border-primary bg-accent text-accent-foreground shadow-sm font-semibold"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            🏠 {t("customer")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setUserType("technician")}
                            className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                              userType === "technician"
                                ? "border-primary bg-accent text-accent-foreground shadow-sm font-semibold"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            🔧 {t("technician")}
                          </button>
                        </div>
                      </div>

                      {/* Technician-only fields */}
                      {!isLogin && userType === "technician" && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border pb-2">
                            <User className="w-4 h-4 text-primary" />
                            {t("auth_tech_section")}
                          </div>
                          <div className="space-y-2">
                            <Label>{t("auth_surname")}</Label>
                            <div className="relative">
                              <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder={t("auth_surname_ph")} value={surname} onChange={(e) => setSurname(e.target.value)} className="pl-9" required />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>{t("auth_address_req")}</Label>
                            <div className="relative">
                              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder={t("auth_address_full_ph")} value={address} onChange={(e) => setAddress(e.target.value)} className="pl-9" required />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>{t("auth_iban")}</Label>
                            <div className="relative">
                              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="PT50 0000 0000 0000 0000 0000 0" value={iban} onChange={(e) => setIban(e.target.value)} className="pl-9" required />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>{t("auth_iban_confirm")}</Label>
                            <div className="relative">
                              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder={t("auth_iban_repeat_ph")} value={ibanConfirm} onChange={(e) => setIbanConfirm(e.target.value)} className="pl-9" required />
                            </div>
                            {(iban || ibanConfirm) && iban.trim() !== ibanConfirm.trim() && (
                              <p className="text-xs text-destructive">{t("auth_err_iban_mismatch")}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label>{t("auth_contact_req")}</Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder={t("auth_phone_main_ph")} value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-9" required />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>{t("auth_emergency_req")}</Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder={t("auth_emergency_ph")} value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} className="pl-9" required />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Customer-only fields: Address + Billing */}
                      {isCustomerSignup && (
                        <>
                          {/* Address Section */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border pb-2">
                              <MapPin className="w-4 h-4 text-primary" />
                              {t("address")}
                            </div>
                            <div className="space-y-2">
                              <Label>{t("address")}</Label>
                              <div className="relative">
                                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input placeholder={t("address_placeholder")} value={address} onChange={(e) => handleAddressChange(e.target.value)} className="pl-9" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>{t("address_complement")}</Label>
                              <div className="relative">
                                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input placeholder={t("address_complement_placeholder")} value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} className="pl-9" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>{t("localidade")}</Label>
                              <div className="relative">
                                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input placeholder={t("localidade_placeholder")} value={localidade} onChange={(e) => setLocalidade(e.target.value)} className="pl-9" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>{t("postal_code")}</Label>
                              <div className="relative">
                                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="0000-000" value={postalCode} onChange={(e) => handlePostalCodeChange(e.target.value)} className="pl-9" />
                              </div>
                            </div>
                          </div>

                          {/* Billing Section */}
                          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                              <FileText className="w-4 h-4 text-primary" />
                              {t("billing_data")}
                            </div>

                            {/* Billing Name */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label>{t("billing_name_label")}</Label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <Checkbox checked={sameName} onCheckedChange={(c) => handleSameNameToggle(!!c)} />
                                  <span className="text-xs text-muted-foreground">{t("same_name")}</span>
                                </label>
                              </div>
                              <div className="relative">
                                <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder={t("billing_name_placeholder")}
                                  value={sameName ? fullName : billingName}
                                  onChange={(e) => setBillingName(e.target.value)}
                                  className="pl-9"
                                  disabled={sameName}
                                />
                              </div>
                            </div>

                            {/* Billing Address */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label>{t("billing_address")}</Label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <Checkbox checked={sameAddress} onCheckedChange={(c) => handleSameAddressToggle(!!c)} />
                                  <span className="text-xs text-muted-foreground">{t("same_address")}</span>
                                </label>
                              </div>
                              <div className="relative">
                                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder={t("billing_address_placeholder")}
                                  value={sameAddress ? address : billingAddress}
                                  onChange={(e) => setBillingAddress(e.target.value)}
                                  className="pl-9"
                                  disabled={sameAddress}
                                />
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">{t("email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t("password")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-10" required minLength={6} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {isLogin && (
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="rounded border-border" />
                        <span className="text-sm text-muted-foreground">{t("remember_me")}</span>
                      </label>
                      <button type="button" onClick={() => setForgotPassword(true)} className="text-sm text-primary hover:underline">
                        {t("forgot_password")}
                      </button>
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t("loading_wait") : isLogin ? t("login") : t("create_account")}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-primary hover:underline">
                    {isLogin ? t("no_account") : t("has_account")}
                  </button>
                </div>

              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
