import { fetchSubscriptionStatus, startCheckout, redeemReferral } from "@/lib/billing";
import type { IdentityRecord } from "@nada/db";
import type { SubscriptionStatusResponse, PaidBillingPlan } from "@nada/types";
import { IconButton, Button } from "@nada/ui";
import { X, CreditCard, Gift } from "lucide-react";
import { Sheet } from "./Sheet";
import { useState, useEffect } from "react";

const BILLING_PLANS: Array<{
  description: string;
  features: string[];
  label: string;
  plan: PaidBillingPlan;
}> = [
  {
    description: "Launch-ready limits for heavier private messaging.",
    features: ["Larger files", "Longer voice notes", "Premium themes", "More communities"],
    label: "Pro",
    plan: "pro"
  },
  {
    description: "Advanced anonymous growth tools for creators.",
    features: ["Verified anonymous profile", "Community catalog", "Bot API", "ZK analytics"],
    label: "Business",
    plan: "business"
  },
  {
    description: "Private infrastructure for teams and operators.",
    features: ["Self-hosted relay", "SLA", "Admin controls", "Compliance notes"],
    label: "Enterprise",
    plan: "enterprise"
  }
];

export function BillingSheet({
      identity,
      onClose
    }: {
          identity: IdentityRecord;
          onClose: () => void;
        }): JSX.Element {
    const [referralCode, setReferralCode] = useState("");
    const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);
    const [statusMessage, setStatusMessage] = useState("Checking plan...");
    useEffect(() => {
    let active = true;

    void fetchSubscriptionStatus(identity.pubkeyHash).then((snapshot) => {
      if (!active) {
        return;
      }

      setStatus(snapshot);
      setStatusMessage(snapshot ? `${snapshot.plan} / ${snapshot.status}` : "Relay billing is not configured.");
    });

    return () => {
      active = false;
    };
    }, [identity.pubkeyHash]);
    const checkout = async (plan: PaidBillingPlan): Promise<void> => {
            if (typeof window === "undefined") {
              return;
            }

            setStatusMessage("Opening Stripe Checkout...");
            const trimmedReferralCode = referralCode.trim();
            const response = await startCheckout({
              cancelUrl: window.location.href,
              plan,
              pubkeyHash: identity.pubkeyHash,
              successUrl: window.location.href,
              ...(trimmedReferralCode ? { referralCode: trimmedReferralCode } : {})
            });
            if (response?.checkoutUrl) {
              window.location.assign(response.checkoutUrl);
              return;
            }

            setStatusMessage(response?.message ?? "Checkout is not available.");
          };
    const redeem = async (): Promise<void> => {
            const trimmed = referralCode.trim();
            if (!trimmed) {
              return;
            }

            const response = await redeemReferral({
              pubkeyHash: identity.pubkeyHash,
              referralCode: trimmed
            });
            setStatusMessage(response?.message ?? "Referral could not be redeemed.");
          };
    return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Plans</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 rounded-xl bg-nada-muted p-4 text-sm text-nada-secondary">
        <div className="mb-2 flex items-center gap-2 font-medium text-nada-primary">
          <CreditCard size={16} />
          {statusMessage}
        </div>
        Paid plans are linked to your public-key hash and Stripe customer ID,
        never message content.
      </div>

      <div className="mt-4 grid gap-2.5">
        {BILLING_PLANS.map((plan) => (
          <div className="nada-surface-elevated rounded-xl p-4" key={plan.plan}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-nada-primary">{plan.label}</h3>
                <p className="mt-1 text-xs text-nada-secondary">{plan.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {plan.features.map((feature) => (
                    <span className="nada-privacy-chip" key={feature}>{feature}</span>
                  ))}
                </div>
              </div>
              <Button
                onClick={() => {
                  void checkout(plan.plan);
                }}
                size="sm"
              >
                Choose
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-nada-border/10 pt-5">
        <div className="flex items-center gap-2 text-xs text-nada-secondary">
          <Gift size={14} />
          Referral
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="nada-input h-10 min-w-0 flex-1 px-3 text-sm"
            onChange={(event) => {
              setReferralCode(event.target.value);
            }}
            placeholder="Referral code"
            value={referralCode}
          />
          <Button onClick={() => void redeem()} variant="secondary" size="sm">
            Redeem
          </Button>
        </div>
      </div>

      {status?.capabilityToken ? (
        <div className="mt-4 rounded-xl bg-nada-muted p-3 text-xs text-nada-secondary">
          Capability token issued locally for this pubkey hash.
        </div>
      ) : null}
    </Sheet>
    );
}
