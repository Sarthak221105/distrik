import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/components/marketing/links";
import { Placeholder, PolicyDocument, type PolicySection } from "@/components/marketing/policy-document";

export const metadata: Metadata = {
  title: "Cancellation and refunds",
  description: "How to cancel a Distrik plan and when refunds apply for monthly and yearly billing. Draft pending legal review.",
};

const sections: PolicySection[] = [
  {
    id: "overview",
    title: "Overview",
    content: (
      <>
        <p>
          Distrik plans are billed monthly, or yearly in advance at a discount. Prices are in Indian rupees, plus GST.
          This policy explains how to cancel and when you can get money back. It forms part of our{" "}
          <Link href="/policies/terms">terms of service</Link>.
        </p>
      </>
    ),
  },
  {
    id: "pre-launch",
    title: "Before your workspace is active",
    content: (
      <>
        <p>
          Online payment is coming soon. Until then, choosing a plan only adds you to the waitlist: nothing is charged.
          You can withdraw your application at any time by writing to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <p>
          If you pay before your workspace is activated and then change your mind, we refund the full amount, including
          GST.
        </p>
      </>
    ),
  },
  {
    id: "first-payment",
    title: "7-day refund on your first payment",
    content: (
      <>
        <p>
          If Distrik is not right for you, ask within <Placeholder>7</Placeholder> days of your first payment and we
          will refund it in full, for monthly and yearly plans alike. This applies once per company.
        </p>
      </>
    ),
  },
  {
    id: "monthly",
    title: "Cancelling a monthly plan",
    content: (
      <>
        <ul>
          <li>You can cancel at any time. Cancellation takes effect at the end of the current billing month.</li>
          <li>You keep full access until then, and you will not be charged again.</li>
          <li>
            After the 7-day window, we do not refund part-used months. <Placeholder>Confirm with legal</Placeholder>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "yearly",
    title: "Cancelling a yearly plan",
    content: (
      <>
        <ul>
          <li>You can cancel at any time. Your plan stays active until the end of the paid year and does not renew.</li>
          <li>
            Within the 7-day window, you get a full refund. After that,{" "}
            <Placeholder>
              we refund the unused full months at the yearly monthly-equivalent rate, less any discount already given /
              no refund: to be decided
            </Placeholder>
            .
          </li>
          <li>You can switch from yearly to monthly billing from your next renewal date.</li>
        </ul>
      </>
    ),
  },
  {
    id: "changes",
    title: "Upgrades and downgrades",
    content: (
      <>
        <p>
          Upgrades take effect straight away and we charge the difference for the rest of the billing period.
          Downgrades take effect from the next billing period. If a downgrade means you exceed the new plan’s limits,
          for example team seats, you will need to reduce usage first.
        </p>
      </>
    ),
  },
  {
    id: "how",
    title: "How to cancel or request a refund",
    content: (
      <>
        <ol>
          <li>
            The workspace owner writes to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the owner’s email
            address, or uses the billing settings in the app once available.
          </li>
          <li>Include your company name and, for a refund, the payment or invoice number.</li>
          <li>We confirm the cancellation by email, with the date your access ends.</li>
        </ol>
      </>
    ),
  },
  {
    id: "processing",
    title: "How refunds are paid",
    content: (
      <>
        <p>
          Approved refunds go back to the original payment method within <Placeholder>5 to 7 working days</Placeholder>{" "}
          of approval. Your bank may take longer to show it. Where GST was charged, we issue a credit note.
        </p>
      </>
    ),
  },
  {
    id: "exceptions",
    title: "When refunds do not apply",
    content: (
      <>
        <p>
          We may refuse a refund if a workspace was suspended for breaking our{" "}
          <Link href="/policies/terms#acceptable-use">acceptable use rules</Link>, such as sending cold broadcasts.
          Charges from third parties that you pay directly, for example your WhatsApp business provider, are not
          covered by this policy.
        </p>
      </>
    ),
  },
  {
    id: "data",
    title: "Your data after cancellation",
    content: (
      <>
        <p>
          After your plan ends, you can export your data for <Placeholder>30</Placeholder> days. We then delete it,
          except records we must keep by law, such as invoices. See the{" "}
          <Link href="/policies/privacy">privacy notice</Link> for details.
        </p>
      </>
    ),
  },
];

export default function RefundsPage() {
  return (
    <PolicyDocument
      title="Cancellation and refunds"
      path="/policies/refunds"
      summary={
        <p>
          Cancel any time. Monthly plans stop at the end of the month; yearly plans run to the end of the paid year. Your
          first payment is refundable within 7 days.
        </p>
      }
      sections={sections}
    />
  );
}
