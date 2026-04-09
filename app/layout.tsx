import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'
import './editor/editor-theme.css'
import './editor/editor-global.css'
import './viewer-admin-surface.css'

export const metadata: Metadata = {
  title: '数字孪生平台 | Digital Twin Platform',
  description: '空间建模、实体管理、实时定位、可视化规则引擎的通用数字孪生平台',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/placeholder-logo.svg',
        type: 'image/svg+xml',
      },
      {
        url: '/placeholder-logo.png',
        type: 'image/png',
      },
    ],
    apple: '/placeholder-logo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
