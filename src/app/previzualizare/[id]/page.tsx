import { WorkspaceProvider } from "@/components/workspace-provider";
import { PropertyPreview } from "@/components/property-preview";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <WorkspaceProvider>
      <PropertyPreview id={id} />
    </WorkspaceProvider>
  );
}
