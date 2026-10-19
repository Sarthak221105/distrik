"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/domain/states";
import { useViewer } from "@/components/providers";
import { useTrackScreen } from "@/components/manufacturer/hooks";
import { WhatsAppTestPanel } from "@/components/manufacturer/sandbox-simulator";
import { TeamSettings } from "./team-settings";
import { CompanySettings } from "./company-settings";
import { TemplateSettings } from "./template-settings";
import { FitWeightSettings } from "./fit-weight-settings";
import { DataExport } from "./data-export";
import { PrivacySettings } from "./privacy-settings";

const ALL_TABS = [
  { value: "team", label: "Team & permissions" },
  { value: "company", label: "Company profile" },
  { value: "templates", label: "Templates & channels" },
  { value: "weights", label: "Fit weights" },
  { value: "export", label: "Data export" },
  { value: "privacy", label: "Privacy", ownerOnly: true },
  { value: "whatsapp-test", label: "WhatsApp test" },
];

export function SettingsClient({ initialTab }: { initialTab: string }) {
  useTrackScreen("settings");
  const viewer = useViewer();
  const tabs = ALL_TABS.filter((t) => !t.ownerOnly || viewer.role === "owner");
  const [tab, setTab] = useState(tabs.some((t) => t.value === initialTab) ? initialTab : "team");
  return (
    <div className="grid gap-4">
      <PageHeader title="Settings" description="Team and permissions, company, channels, scoring, exports and privacy." />
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList aria-label="Settings sections">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="team"><TeamSettings /></TabsContent>
        <TabsContent value="company"><CompanySettings /></TabsContent>
        <TabsContent value="templates"><TemplateSettings /></TabsContent>
        <TabsContent value="weights"><FitWeightSettings /></TabsContent>
        <TabsContent value="export"><DataExport /></TabsContent>
        {viewer.role === "owner" && <TabsContent value="privacy"><PrivacySettings /></TabsContent>}
        <TabsContent value="whatsapp-test"><WhatsAppTestPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
