---
name: pwa-delivery
description: Decide what this project's PWA can promise on iOS and Android, keep the install and offline setup working, and show the app on a real phone during a demo. Use when touching the manifest, service worker, install prompts, push notifications, or planning a mobile demo.
---

The frontend is already a PWA through `vite-plugin-pwa`; do not add a second service worker or a hosted PWA service. `frontend/vite.config.ts` owns the manifest, `registerType: "prompt"` keeps updates from discarding in-progress forms, and `navigateFallbackDenylist` keeps `/api` out of the cache. Icons live in `frontend/public`. Service workers stay disabled in development. Verify changes with `docker compose exec frontend npm run build` and read the generated `dist/manifest.webmanifest`.

## Installability

Installation requires HTTPS — or `localhost`/`127.0.0.1` — plus a manifest carrying `name`, 192px and 512px icons, `start_url` and `display`. A service worker is not required to install, only to work offline. Both icon sizes are already present; keep them if you change branding.

## Platform limits worth knowing before promising a feature

Safari on iOS does not implement `beforeinstallprompt`. There is no automatic install banner and no way to trigger installation from code: the user opens the Share menu and taps "На экран «Домой»". Write install instructions for iOS instead of a button. Chromium on Android and desktop does fire `beforeinstallprompt`, so a custom install button is possible there — feature-detect it, never branch on the user agent.

Web Push works on iOS 16.4 and later, but only for a web app already added to the Home Screen, only with `display` set to `standalone` or `fullscreen`, and only when permission is requested from a direct user gesture such as a tap on a subscribe button. Android Chrome has no such restriction. Allow `*.push.apple.com` on any server that sends pushes.

Camera, file upload, geolocation and offline caching are available on both platforms. NFC, Bluetooth, home screen widgets and true background execution are not available on iOS — if a use case needs them, say so early rather than during the demo.

## Showing the app on someone else's phone

`localhost` counts as a secure origin only on the machine serving it. A judge's phone reaching the dev server over the LAN gets plain HTTP, so the app will not install and push will not work. Plan for an HTTPS tunnel or a deployed origin before the demo, and rehearse the install flow once on a real iPhone — the Share-menu step surprises people.

## Third-party PWA services

Do not integrate hosted toolkits such as Progressier. They inject a remote script and replace the service worker, which collides with `vite-plugin-pwa`, require a paid account, and add a live network dependency at the venue. Everything they sell — manifest, install flow, offline shell, push — is reachable with the standard APIs already wired here.
