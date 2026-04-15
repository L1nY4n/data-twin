import { DigitalTwinViewerPage } from '@/components/digital-twin/DigitalTwinViewerPage'

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  await params
  return <DigitalTwinViewerPage />
}
