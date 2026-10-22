import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/components/marketing/links";
import { Placeholder, PolicyDocument, type PolicySection } from "@/components/marketing/policy-document";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using Distrik, the AI sales employee for Indian manufacturers. Draft pending legal review.",
};

const sections: PolicySection[] = [
  {
    id: "about",
    title: "About these terms",
    content: (
      <>
        <p>
          These terms govern your use of Distrik, a software service that helps manufacturers find business buyers,
          communicate with them on WhatsApp and manage quotations and orders (the “Service”). The Service is provided by{" "}
          <Placeholder>legal entity name, CIN and registered address</Placeholder> (“Distrik”, “we”, “us”).
        </p>
        <p>
          By creating a workspace, joining the waitlist with a plan, or using the Service, you agree to these terms on
          behalf of the company you represent (“you”, the “Customer”). If you do not agree, do not use the Service.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use Distrik",
    content: (
      <>
        <p>The Service is for businesses only. To use it you must:</p>
        <ul>
          <li>be a business registered in India and selling to other businesses (B2B);</li>
          <li>be at least 18 years old and authorised to bind your company to these terms;</li>
          <li>give accurate company details, including your GSTIN where you have one.</li>
        </ul>
        <p>The Service is not intended for selling to consumers.</p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Your workspace and team",
    content: (
      <>
        <p>
          Each Customer gets one workspace. The owner can invite team members and assign roles such as sales head or
          sales rep, and can set approval limits. You are responsible for everything done under your workspace, for
          keeping sign-in links and passwords secure, and for removing access for people who leave your company.
        </p>
        <p>Your plan sets the number of team seats, active campaigns and prospects per month.</p>
      </>
    ),
  },
  {
    id: "plans",
    title: "Plans, billing and taxes",
    content: (
      <>
        <p>
          Plans are billed monthly, or yearly in advance at a discount. Prices are in Indian rupees and exclusive of GST,
          which is added at the applicable rate. Current prices are shown on our <Link href="/#pricing">pricing</Link>{" "}
          section.
        </p>
        <p>
          <strong>Pre-launch:</strong> online payment is not yet available. When you choose a plan, we record your
          application and add you to the waitlist. You are not charged until we activate your workspace and confirm the
          first payment with you.
        </p>
        <p>
          We may change prices for future billing periods with at least <Placeholder>30</Placeholder> days’ notice by
          email. Cancellations and refunds are covered by our <Link href="/policies/refunds">cancellation and refunds
          policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "ai-agent",
    title: "The AI agent and your price rules",
    content: (
      <>
        <p>
          The Service includes an AI agent that converses with buyers on your behalf. You control what it may do through
          your products, price rules and autonomy settings. In particular:
        </p>
        <ul>
          <li>
            The agent only quotes prices that your rules allow. A price below your floor requires approval by an
            authorised person in your team; a price below your hard minimum is refused.
          </li>
          <li>Credit, special payment terms, contract changes and legal commitments always need a person.</li>
          <li>Orders are created only after a person in your team confirms them.</li>
        </ul>
        <p>
          You are responsible for the accuracy of your product data, prices, tax configuration and rules. The agent can
          make mistakes in wording or understanding; you should review conversations, quotations and purchase orders
          before relying on them. GST details on quotations follow your configuration and should be confirmed with your
          accountant.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>send cold or bulk WhatsApp messages to purchased or scraped number lists;</li>
          <li>message anyone who has opted out, or try to bypass consent, template or rate-limit controls;</li>
          <li>break WhatsApp Business policies, Meta’s commerce policies or any applicable law;</li>
          <li>sell prohibited or regulated goods without the required licences;</li>
          <li>upload data you have no lawful right to use, or attempt to access another customer’s data;</li>
          <li>reverse engineer, overload or interfere with the Service.</li>
        </ul>
        <p>
          We may pause messaging or suspend a workspace that puts buyers, WhatsApp accounts or the Service at risk. Where
          practical, we will tell you first and give you a chance to fix the issue.
        </p>
      </>
    ),
  },
  {
    id: "data",
    title: "Your data",
    content: (
      <>
        <p>
          You own your data: products, prices, documents, buyer records and conversations. You give us permission to
          process it only to provide, secure and improve the Service for you.
        </p>
        <p>
          For buyer and contact data, you decide why and how it is used, and you act as the data fiduciary under the
          Digital Personal Data Protection Act, 2023. We process that data on your behalf, under your instructions. Our{" "}
          <Link href="/policies/privacy">privacy notice</Link> explains how we handle personal data, including that it
          is stored in India.
        </p>
        <p>
          You can export your data while your workspace is active. After cancellation we keep it for{" "}
          <Placeholder>30</Placeholder> days so you can export it, then delete it, except where the law requires us to
          keep records.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Service availability and changes",
    content: (
      <>
        <p>
          We work to keep the Service available and secure, but we do not promise it will be uninterrupted or error
          free. Third-party services such as WhatsApp, our messaging provider and AI model providers can affect
          availability. We may improve or change features over time and will give notice of changes that materially
          reduce what your plan includes.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    content: (
      <>
        <p>
          You can cancel at any time as described in the refunds policy. We may suspend or end your access if you
          materially breach these terms, fail to pay, or if the law requires it. On termination your right to use the
          Service ends, and your data is handled as described in “Your data”.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    content: (
      <>
        <p>
          To the extent the law allows, the Service is provided “as is”. Neither party is liable for indirect or
          consequential losses, such as lost profits or lost business. Our total liability for any claim is limited to
          the fees you paid us in the <Placeholder>12</Placeholder> months before the claim arose.
        </p>
        <p>
          <Placeholder>Indemnities, warranties and carve-outs to be drafted by counsel</Placeholder>
        </p>
      </>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    content: (
      <>
        <p>
          These terms are governed by the laws of India. Courts at <Placeholder>city</Placeholder> have exclusive
          jurisdiction, subject to any dispute resolution process agreed in writing.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    content: (
      <>
        <p>
          We may update these terms. The version date at the top shows when they last changed. For material changes we
          will email workspace owners at least <Placeholder>15</Placeholder> days in advance. Continuing to use the
          Service after the change means you accept the updated terms.
        </p>
        <p>
          Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <PolicyDocument
      title="Terms of service"
      path="/policies/terms"
      summary={
        <p>
          The rules for using Distrik: who it is for, how billing works, what the AI agent may and may not do, and how we
          handle your data.
        </p>
      }
      sections={sections}
    />
  );
}
