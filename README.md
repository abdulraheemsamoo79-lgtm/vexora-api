# VEXORA API

Hamari apni downloader APIs — VEXORA SMD WhatsApp bot ke liye. Vercel par hosted, GitHub se auto-deploy.

Faaida: bahar wali free APIs (adeel-xtech waghera) band ho jati hain aur bot ruk jata hai. Ab bot sirf **is** API ko call karega — peeche wala backend mare to sirf yahan andar badlega, bot nahi rukega.

## Endpoints

| Endpoint | Kaam | Peeche (backend) |
|---|---|---|
| `GET /api/ping` | Health check | — |
| `GET /api/ttdl?url=` | TikTok download (simple format) | tikwm |
| `GET /api/tiktok-v2?url=` | TikTok download + stats | tikwm |
| `GET /api/ttsearch?q=` | TikTok search | tikwm |
| `GET /api/mediafire?url=` | MediaFire direct link | khud scraping |
| `GET /api/instagram?url=` | Instagram download | Apify (env token) |
| `GET /api/attp?text=` | Animated rainbow text GIF | khud generate |

## Setup notes

- Instagram endpoint ko Vercel Settings → Environment Variables mai `APIFY_TOKEN` chahiye (bot/app wala Apify token). Token code mai kabhi nahi likha jata.
- Baqi endpoints ko koi key nahi chahiye.
- Deploy: Vercel par repo import → Deploy. Har GitHub push par auto-deploy.

## Local test

```
npm install
node test-server.js   # http://localhost:8311/api/ping
```
