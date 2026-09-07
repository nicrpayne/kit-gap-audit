import BootstrapWorkspace from "@/components/bootstrap/BootstrapWorkspace";

export const dynamic = "force-dynamic";

export default async function ProjectBootstrapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BootstrapWorkspace bootstrapId={id} />;
}
