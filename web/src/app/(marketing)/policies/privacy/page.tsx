import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/components/marketing/links";
import { Placeholder, PolicyDocument, type PolicySection } from "@/components/marketing/policy-document";

export const metadata: Metadata = {
  title: "Privacy and DPDP notice",
  description:
    "How Distrik collects, uses, stores and protects personal data, including our notice under the Digital Personal Data Protection Act, 2023. Draft pending legal review.",
};

const sections: PolicySection[] = [
  {
    id: "who",
    title: "Who we are and what this covers",
    content: (
      <>
        <p>
          This notice explains how <Placeholder>legal entity name</Placeholder> (“Distrik”, “we”) handles personal data
          when you visit our website, join the waitlist, use the Distrik app, or receive a WhatsApp message sent through
          Distrik on behalf of a manufacturer.
        </p>
        <p>There are two situations, and our role differs in each:</p>
        <ul>
          <li>
            <strong>Our own customers and visitors.</strong> For waitlist sign-ups, applicants and the people who use
            the app, Distrik decides how data is used and is the data fiduciary.
          </li>
          <li>
            <strong>Buyers contacted by a manufacturer.</strong> For distributors, dealers and their staff, the
            manufacturer decides why they are contacted and is the data fiduciary. Distrik processes that data on the
            manufacturer’s behalf.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "dpdp",
    title: "Notice under the DPDP Act, 2023",
    content: (
      <>
        <p>
          This section is our notice under section 5 of the Digital Personal Data Protection Act, 2023 (the “DPDP Act”).
        </p>
        <h3>What personal data we process</h3>
        <table>
          <thead>
            <tr>
              <th scope="col">Whose data</th>
              <th scope="col">What</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Waitlist and applicants</td>
              <td>Email, name, company name, and the plan and details you submit when applying.</td>
            </tr>
            <tr>
              <td>App users (manufacturer teams)</td>
              <td>Name, work email, phone number, role, sign-in records and actions taken in the app.</td>
            </tr>
            <tr>
              <td>Buyer contacts</td>
              <td>
                Business name and address, contact name, role, business phone or email, consent status and its evidence,
                WhatsApp messages, quotations and purchase orders.
              </td>
            </tr>
            <tr>
              <td>Website visitors</td>
              <td>Basic technical data such as IP address, browser type and pages requested, kept in security logs.</td>
            </tr>
          </tbody>
        </table>

        <h3>Why we process it</h3>
        <ul>
          <li>To run the waitlist, review applications, activate workspaces and email sign-in links.</li>
          <li>To provide the Service: discovery, lead review, WhatsApp conversations, quotations, PO matching and reorders.</li>
          <li>To keep the Service secure, prevent abuse and keep audit trails of approvals and orders.</li>
          <li>To bill customers and meet legal, tax and accounting obligations.</li>
          <li>To contact you about the Service. We do not sell personal data or use it for advertising.</li>
        </ul>
        <p>
          We process data on the basis of your consent, or for legitimate uses allowed by the DPDP Act, such as data you
          provide voluntarily for a specific purpose and compliance with law. Each contact record carries its recorded
          basis and consent evidence.
        </p>

        <h3>How long we keep it</h3>
        <table>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Retention</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Waitlist entries</td>
              <td>
                Until early access opens for you, or <Placeholder>12 months</Placeholder>, whichever is sooner, unless you
                ask us to delete it earlier.
              </td>
            </tr>
            <tr>
              <td>Workspace and buyer data</td>
              <td>
                While the workspace is active, then <Placeholder>30 days</Placeholder> after cancellation for export, then
                deleted.
              </td>
            </tr>
            <tr>
              <td>Invoices and billing records</td>
              <td>As long as tax law requires (currently <Placeholder>8 years</Placeholder>).</td>
            </tr>
            <tr>
              <td>Security logs</td>
              <td>
                <Placeholder>90 days</Placeholder>
              </td>
            </tr>
          </tbody>
        </table>

        <h3>Your rights</h3>
        <p>Under the DPDP Act you have the right to:</p>
        <ul>
          <li>
            <strong>Access</strong> a summary of the personal data we process about you and how we process it;
          </li>
          <li>
            <strong>Correction and completion</strong> of inaccurate or incomplete data;
          </li>
          <li>
            <strong>Erasure</strong> of data that is no longer needed or that you withdraw consent for. We can erase or
            anonymise a contact across messages, contact records and analytics;
          </li>
          <li>
            <strong>Withdraw consent</strong> at any time, as easily as you gave it. On WhatsApp, reply STOP;
          </li>
          <li>
            <strong>Grievance redressal</strong> through our Grievance Officer, below;
          </li>
          <li>
            <strong>Nominate</strong> another person to exercise your rights in case of death or incapacity.
          </li>
        </ul>
        <p>
          If you are a buyer contacted for a manufacturer, you can send your request to that manufacturer or to us; we
          will pass it on and help them act on it.
        </p>
        <p>
          If you are not satisfied with our response, you may complain to the Data Protection Board of India.
        </p>
      </>
    ),
  },
  {
    id: "consent",
    title: "WhatsApp consent and opt-out",
    content: (
      <>
        <p>Distrik is designed so that messages reach only people who are willing to receive them:</p>
        <ul>
          <li>Messages go only to contacts who have engaged with the manufacturer or opted in. Evidence is recorded.</li>
          <li>Outside WhatsApp’s 24-hour customer service window, only Meta-approved templates can be sent.</li>
          <li>Each manufacturer has a daily message cap.</li>
          <li>
            Reply <strong>STOP</strong> at any time. You are opted out immediately, before any further queued message is
            sent, and the change is logged.
          </li>
          <li>We do not allow cold broadcasts to purchased or scraped number lists.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI processing",
    content: (
      <>
        <p>
          Replies are drafted by an AI model working only from the manufacturer’s product information and the
          conversation. We limit the personal data sent to the model to what the task needs. Prices and consent
          decisions are made by fixed rules in our database, not by the AI.{" "}
          <Placeholder>AI provider’s data retention and model-training terms to be confirmed by legal</Placeholder>
        </p>
      </>
    ),
  },
  {
    id: "storage",
    title: "Where data is stored and who we share it with",
    content: (
      <>
        <p>
          Our database, files and backups are hosted in India, in the Mumbai region. We share personal data only with
          service providers who help us run the Service, under contracts that require them to protect it:
        </p>
        <ul>
          <li>cloud hosting and database (Mumbai region);</li>
          <li>WhatsApp Business Platform and our WhatsApp business solution provider, to deliver messages;</li>
          <li>an AI model provider, to draft replies and read purchase orders;</li>
          <li>an email provider, to send sign-in links and notifications.</li>
        </ul>
        <p>
          <Placeholder>Named list of processors, and any processing outside India with its safeguards, to be confirmed
          by legal</Placeholder>
        </p>
        <p>We may also disclose data where the law requires it.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <>
        <p>
          Every customer’s data is isolated with row-level security, so one manufacturer can never see another’s records,
          and reps see only leads assigned to them. Files are kept in private storage and shared through short-lived
          links. Access to personal data is logged. Our platform administrators work from aggregates and cannot read a
          manufacturer’s buyers or conversations.
        </p>
        <p>
          If a personal data breach occurs, we will notify affected customers and the Data Protection Board as the DPDP
          Act requires.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    content: (
      <>
        <p>
          We use essential cookies to keep you signed in and secure. We do not use advertising cookies.{" "}
          <Placeholder>Analytics cookies, if any, to be listed here</Placeholder>
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    content: (
      <p>
        Distrik is a business service for adults. We do not knowingly process personal data of anyone under 18.
      </p>
    ),
  },
  {
    id: "grievance",
    title: "Grievance Officer and contact",
    content: (
      <>
        <p>To exercise your rights or raise a concern, contact our Grievance Officer:</p>
        <ul>
          <li>
            Name: <Placeholder>Grievance Officer name</Placeholder>
          </li>
          <li>
            Email: <Placeholder>grievance@distrik.test</Placeholder>
          </li>
          <li>
            Address: <Placeholder>registered office address</Placeholder>
          </li>
        </ul>
        <p>
          We will acknowledge your request within <Placeholder>48 hours</Placeholder> and respond within{" "}
          <Placeholder>30 days</Placeholder>. For anything else, write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <PolicyDocument
      title="Privacy and DPDP notice"
      path="/policies/privacy"
      summary={
        <p>
          What personal data Distrik handles, why, how long we keep it, where it is stored (India), and the rights you
          have under the Digital Personal Data Protection Act, 2023.
        </p>
      }
      sections={sections}
    />
  );
}
