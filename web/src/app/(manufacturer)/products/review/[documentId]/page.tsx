import { CatalogueReview } from "@/components/manufacturer/catalogue-review";

export const metadata = { title: "Review catalogue" };

export default async function CatalogueReviewPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return <CatalogueReview documentId={documentId} />;
}
