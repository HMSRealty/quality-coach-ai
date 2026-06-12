"use client";

import { LegalLayout, H2, P, UL, LI } from "@/app/_components/LegalLayout";

export default function RefundPage() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated="June 12, 2026">
      <P>
        We want every customer to be successful on RealTrack. If we&apos;re not the right fit, here&apos;s how refunds work.
      </P>

      <H2>1. 14-Day Money-Back Guarantee</H2>
      <P>
        New paid subscriptions are covered by a 14-day money-back guarantee.
        If you&apos;re not satisfied for any reason within 14 days of your first payment,
        email <a href="mailto:info@realtrack.app" style={{ color: "#0284C7", fontWeight: 600 }}>info@realtrack.app</a>
        with the subject &quot;Refund Request&quot; and we&apos;ll process a full refund within 5 business days.
      </P>

      <H2>2. After 14 Days</H2>
      <UL>
        <LI>Monthly subscriptions are non-refundable after the 14-day window.</LI>
        <LI>You can cancel at any time. Cancellation stops future renewals — you keep access for the remainder of the current billing period.</LI>
        <LI>Partial-month refunds are not provided. If you need a prorated refund due to exceptional circumstances, email us and we&apos;ll review case by case.</LI>
      </UL>

      <H2>3. Refunds Not Available For</H2>
      <UL>
        <LI>Accounts terminated for breach of our <a href="/terms" style={{ color: "#0284C7", fontWeight: 600 }}>Terms of Service</a>.</LI>
        <LI>Charges older than 90 days.</LI>
        <LI>Add-on consumption already used (e.g., AI analyses already performed).</LI>
      </UL>

      <H2>4. How to Cancel</H2>
      <P>
        To cancel your subscription, email <a href="mailto:info@realtrack.app" style={{ color: "#0284C7", fontWeight: 600 }}>info@realtrack.app</a>
        from the email address on your account. We&apos;ll confirm cancellation within 24 hours.
      </P>
      <P>
        Your data is retained for 30 days after cancellation in case you want to reactivate. After 30 days it is permanently deleted.
      </P>

      <H2>5. How to Request a Refund</H2>
      <P>Email us with:</P>
      <UL>
        <LI>The email address on your account.</LI>
        <LI>The date of the payment you&apos;d like refunded.</LI>
        <LI>A brief reason (optional but helps us improve).</LI>
      </UL>
      <P>
        Approved refunds are returned to the same bank account that sent the original transfer, usually within 5 business days
        depending on your bank.
      </P>

      <H2>6. Annual / Enterprise Contracts</H2>
      <P>
        Annual prepaid and Enterprise contracts have separate refund terms negotiated as part of the contract.
        Refer to your signed agreement, or email us.
      </P>

      <H2>7. Questions</H2>
      <P>
        Any concerns about a charge or refund — email <a href="mailto:info@realtrack.app" style={{ color: "#0284C7", fontWeight: 600 }}>info@realtrack.app</a>
        and we&apos;ll get back within one business day.
      </P>
    </LegalLayout>
  );
}
