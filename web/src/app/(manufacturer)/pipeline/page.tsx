import { PageHeader } from "@/components/domain/states";
import { PipelineBoard } from "@/components/manufacturer/pipeline-board";
import { ScreenTracker } from "@/components/manufacturer/screen-tracker";

export const metadata = { title: "Pipeline" };

export default function PipelinePage() {
  return (
    <div className="grid gap-2">
      <ScreenTracker screen="pipeline" />
      <PageHeader
        title="Pipeline"
        description="Every approved buyer by stage. First and repeat orders are reached only by confirming a PO."
      />
      <PipelineBoard />
    </div>
  );
}
