import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/domain/states";
import { LeadsClient } from "./leads-client";

export const metadata = { title: "Lead Review" };

// Query params (?campaign, ?status, ?id, ?import) are read on the client with
// useSearchParams so notification links work while the page is already open.
export default function LeadsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="table" rows={8} />}>
      <LeadsClient />
    </Suspense>
  );
}
