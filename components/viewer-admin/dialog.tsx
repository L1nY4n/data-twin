'use client'

import type * as React from 'react'
import { DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function ViewerAdminDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        'dark editor-surface viewer-admin-surface viewer-admin-dialog-content p-0 text-foreground',
        className
      )}
      {...props}
    />
  )
}
