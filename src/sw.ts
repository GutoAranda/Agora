/// <reference lib="webworker" />
/* Service worker do Agora: funciona offline e recebe avisos com o app fechado. */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> }

const BASE = import.meta.env.BASE_URL
const ICON = BASE + 'icon-192.png'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL(BASE + 'index.html')))

self.addEventListener('push', (event) => {
  let d: { title?: string; body?: string; tag?: string; url?: string } = {}
  try {
    d = event.data?.json() ?? {}
  } catch {
    d = { title: 'Agora', body: event.data?.text() ?? '' }
  }
  event.waitUntil(
    self.registration.showNotification(d.title ?? 'Agora', {
      body: d.body ?? '',
      tag: d.tag ?? 'agora',
      icon: ICON,
      badge: ICON,
      data: { url: d.url ?? BASE },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data as { url?: string })?.url ?? BASE, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          void (c as WindowClient).navigate(url).catch(() => undefined)
          return (c as WindowClient).focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
