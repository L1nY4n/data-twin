import { redirect } from 'next/navigation'
import { DEFAULT_EDITOR_WORKSPACE_ID } from '@/lib/digital-twin/editor-workspace'

export default function EditorPage() {
  redirect(`/editor/${DEFAULT_EDITOR_WORKSPACE_ID}`)
}
