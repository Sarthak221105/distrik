import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/domain/states";
import { StartSalesForm } from "./start-sales-form";

export const metadata = { title: "Start Sales" };

export default function NewCampaignPage() {
  return (
    <div className="mx-auto grid max-w-4xl gap-2">
      <PageHeader
        back={
          <Link href="/campaigns" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="size-3" aria-hidden /> Campaigns
          </Link>
        }
        title="Start Sales"
        description="Tell the AI which market to sell into. You confirm the plan before any job runs; the buyers it finds arrive in Lead Review for your team to approve."
      />
      <StartSalesForm />
    </div>
  );
}
