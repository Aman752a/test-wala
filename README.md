# Test Wala V7 — Real Online

Production-ready Node/Express + SQLite mock-test platform.

## Owner
Email: `amankeshri7585@gmail.com`
Password: `Aman2004@#`

Change these credentials before public production use.

## Local run
1. Install Node.js 20+
2. `npm install`
3. `JWT_SECRET="a-long-random-secret" OWNER_EMAIL="amankeshri7585@gmail.com" OWNER_PASSWORD="Aman2004@#" npm start`
4. Open `http://localhost:3000`

## Online deployment
Use the included `render.yaml` on Render. Set `OWNER_PASSWORD` as a secret environment variable. SQLite persistence requires a persistent disk; the included Render configuration uses one.

Do not open `public/index.html` directly from a phone file manager. The app must run through the Node server/hosting URL so `/api/*` requests work.
