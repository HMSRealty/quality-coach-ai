"use client";

import { LegalLayout, H2, P, UL, LI } from "@/app/_components/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="June 12, 2026">
      <P>
        Your privacy matters. This policy explains what data RealTrack collects, why, how we use it, and your rights.
      </P>

      <H2>1. What We Collect</H2>
      <UL>
        <LI><strong>Account data</strong>: name, email, phone, company, password (hashed) — provided at signup.</LI>
        <LI><strong>Lead &amp; call data</strong>: addresses, phone numbers, owner names, call recordings, transcripts, AI analysis output — uploaded by you or your dialer.</LI>
        <LI><strong>Payment data</strong>: bank transfer receipts you upload. We do not store card numbers (no card processor is used).</LI>
        <LI><strong>Usage data</strong>: API requests, page views, error logs (via Sentry), uptime metrics.</LI>
        <LI><strong>Integration credentials</strong>: dialer (Readymode) admin credentials, third-party API keys — encrypted at rest with AES-256.</LI>
      </UL>

      <H2>2. How We Use It</H2>
      <UL>
        <LI>Provide the Service you signed up for.</LI>
        <LI>Send transactional emails (welcome, payment receipts, account activation, password reset).</LI>
        <LI>Analyze and improve product performance (aggregate, anonymized usage data).</LI>
        <LI>Respond to support requests.</LI>
        <LI>Detect and prevent fraud, abuse, and security incidents.</LI>
      </UL>
      <P>We do <strong>not</strong> sell your data, share it with advertisers, or use it to train third-party AI models.</P>

      <H2>3. Service Providers (Sub-Processors)</H2>
      <P>We rely on a small set of carefully chosen vendors to operate the Service:</P>
      <UL>
        <LI><strong>Cloudflare</strong> — hosting, CDN, DDoS protection.</LI>
        <LI><strong>Supabase</strong> — database, authentication, file storage (encrypted at rest).</LI>
        <LI><strong>Google Gemini</strong> — AI analysis. Recordings and transcripts are sent for processing; Google does not train on API data.</LI>
        <LI><strong>Resend</strong> — transactional email delivery.</LI>
        <LI><strong>Sentry</strong> — error tracking. Receives stack traces and request metadata, not raw call audio.</LI>
        <LI><strong>RapidAPI / Zillow</strong> — property valuation data (we send addresses only).</LI>
      </UL>
      <P>Each is bound by their own data processing agreements. We never share raw call audio outside Google Gemini and our own storage.</P>

      <H2>4. Data Retention</H2>
      <UL>
        <LI>Active account data is retained for the life of your subscription.</LI>
        <LI>After cancellation, we retain data for 30 days to allow re-activation or export, then permanently delete it.</LI>
        <LI>Anonymized aggregate metrics may be retained longer for product analytics.</LI>
      </UL>

      <H2>5. Your Rights</H2>
      <P>Regardless of where you live, you can:</P>
      <UL>
        <LI>Export your data at any time (CSV / JSON from the Call Library).</LI>
        <LI>Request deletion of your account by emailing <a href="mailto:info@realtrack.app" style={{ color: "#0284C7", fontWeight: 600 }}>info@realtrack.app</a>.</LI>
        <LI>Request a copy of all data we hold about you.</LI>
        <LI>Correct inaccurate data.</LI>
      </UL>
      <P>If you are an EU/UK resident, GDPR rights apply. If you are a California resident, CCPA rights apply. We honor all such requests at no charge.</P>

      <H2>6. Cookies &amp; Tracking</H2>
      <P>
        We use only essential cookies (authentication session, CSRF protection). We do <strong>not</strong> use third-party
        advertising or behavioral tracking cookies. No banner is needed because no consent is required for essential cookies.
      </P>

      <H2>7. Security</H2>
      <UL>
        <LI>All traffic is encrypted with TLS 1.3.</LI>
        <LI>Stored secrets (API keys, dialer credentials) are encrypted with AES-256-GCM.</LI>
        <LI>Row-level security in Supabase isolates each tenant&apos;s data.</LI>
        <LI>API keys are hashed with SHA-256 before storage.</LI>
        <LI>Password reset tokens expire in 1 hour.</LI>
      </UL>
      <P>We monitor for security incidents and will notify affected users within 72 hours of any data breach affecting personal data.</P>

      <H2>8. International Data Transfers</H2>
      <P>
        Data is processed primarily in the United States (Cloudflare, Supabase, Google). EU/UK personal data is transferred
        under Standard Contractual Clauses with our sub-processors.
      </P>

      <H2>9. Children</H2>
      <P>
        RealTrack is a B2B product not intended for individuals under 18. We do not knowingly collect data from minors.
      </P>

      <H2>10. Changes</H2>
      <P>
        Material changes will be announced via email at least 14 days before taking effect.
      </P>

      <H2>11. Contact</H2>
      <P>
        Privacy questions or requests: <a href="mailto:info@realtrack.app" style={{ color: "#0284C7", fontWeight: 600 }}>info@realtrack.app</a>.
      </P>
    </LegalLayout>
  );
}
