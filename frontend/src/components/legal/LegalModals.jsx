import { useEffect, useState } from "react";
import { PrivacyPolicyModal } from "./PrivacyPolicyModal";
import { TermsModal } from "./TermsModal";

/**
 * Mounts the Privacy Policy and Terms modals and opens them in response to
 * window CustomEvents — mirroring CookieConsent's "open-cookie-policy" pattern,
 * so any footer link (landing or in-game) can open them with:
 *   window.dispatchEvent(new CustomEvent("open-privacy-policy"))
 *   window.dispatchEvent(new CustomEvent("open-terms"))
 */
export function LegalModals() {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    const openPrivacy = () => setPrivacyOpen(true);
    const openTerms = () => setTermsOpen(true);
    window.addEventListener("open-privacy-policy", openPrivacy);
    window.addEventListener("open-terms", openTerms);
    return () => {
      window.removeEventListener("open-privacy-policy", openPrivacy);
      window.removeEventListener("open-terms", openTerms);
    };
  }, []);

  return (
    <>
      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </>
  );
}
