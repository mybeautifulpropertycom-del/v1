import { WorkspaceProvider } from "@/components/workspace-provider";
import { Shell } from "@/components/shell";
export const metadata = { robots: { index: false, follow: false } };
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
