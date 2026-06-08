import { AlertTriangle, RefreshCw, ServerOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ViewerAdminCenteredPanel,
  ViewerAdminNotice,
} from '@/components/viewer-admin/primitives'
import { isAdminApiError } from '@/lib/digital-twin/bootstrap-client'

function describeBackendError(error: unknown) {
  if (isAdminApiError(error)) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Backend API is unreachable.'
}

export function BackendUnavailableState({
  title = '后端连接不可用',
  description = '当前页面需要读取工作区配置，但后端 API 暂时无法访问。',
  error,
  retryHref = '/',
}: {
  title?: string
  description?: string
  error?: unknown
  retryHref?: string
}) {
  return (
    <ViewerAdminCenteredPanel
      title={title}
      description={description}
      leading={<ServerOff className="h-4 w-4 text-amber-100" />}
      trailing={
        <Badge className="border border-amber-300/30 bg-amber-400/10 text-amber-100">
          OFFLINE
        </Badge>
      }
    >
      <ViewerAdminNotice
        tone="warning"
        icon={<AlertTriangle className="h-4 w-4" />}
      >
        {describeBackendError(error)}
      </ViewerAdminNotice>
      <Button asChild className="w-full justify-between">
        <a href={retryHref}>
          重试
          <RefreshCw className="h-4 w-4" />
        </a>
      </Button>
    </ViewerAdminCenteredPanel>
  )
}
