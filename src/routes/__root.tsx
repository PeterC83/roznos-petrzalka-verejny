import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { MacalyBridge } from '@macaly/bridge'
import AppConvexProvider from '@/components/convex-client-provider'
import '../styles.css'
import siteMetadata from '../metadata.json'

const rootMeta = siteMetadata['/']

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: rootMeta.title },
      { name: 'description', content: rootMeta.description },
    ],
    links: [
      { rel: 'icon', type: 'image/png', href: 'https://assets.macaly-user-data.dev/oVHtJE8wUms2_rdZbzJVsUs7/dz0zjmc0ij02124vk7o3h86i/LIyhu95w5dxFG32AHiCJy/roznos-icon-48-RFiPYUin.png' },
      { rel: 'apple-touch-icon', href: 'https://assets.macaly-user-data.dev/oVHtJE8wUms2_rdZbzJVsUs7/dz0zjmc0ij02124vk7o3h86i/z5Kv8DNjNClyd8hfh2g2M/roznos-icon-180-7xeFN22l.png' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sk" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <MacalyBridge>
        <body>
          <AppConvexProvider>{children}</AppConvexProvider>
          <Scripts />
        </body>
      </MacalyBridge>
    </html>
  )
}