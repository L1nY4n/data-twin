import type { ReactNode } from 'react'
import { Spline_Sans, Spline_Sans_Mono } from 'next/font/google'
import '../../../editor/editor-theme.css'
import '../../../editor/editor-global.css'

const splineSans = Spline_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-editor-sans',
})

const splineSansMono = Spline_Sans_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-editor-mono',
})

export default function WorkspaceEditorLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <div className={`editor-fonts ${splineSans.variable} ${splineSansMono.variable}`}>
      {children}
    </div>
  )
}
