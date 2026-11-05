# Anti-Null-Mega-Hub
The Anti-Null Realm awaits your creations.

## Run locally

Run `npm start` to open the desktop app. It starts the site on a temporary localhost-only port and stops the server when the app exits; no router port forwarding or public server is needed. This runs the app on your computer, but does not publish a public website. Public accounts, chat, and other shared features still require a continuously running hosted server and a configured MongoDB database.

For local account and permission testing without Atlas, start the private MongoDB replica set and launch the app with its local database configuration:

```sh
docker compose -f compose.local.yaml up -d --wait
npm run start:local
```

On the first launch, use the bootstrap form with `admin@localhost.test` and `anti-null-local-bootstrap`, then choose an admin password. This local database is separate from the remote database in `.env`, persists in a Docker volume, and is only exposed on `127.0.0.1:27017`. Stop it with `docker compose -f compose.local.yaml down`.

## Self-host the website

The website can run on any Linux VPS with Docker Compose; Render and Replit are not required. Point a domain's DNS A record at the VPS, allow inbound ports 80 and 443 on the VPS firewall, then configure and start the stack:

```sh
cp -n .env.example .env
openssl rand -hex 32
```

If `.env` already exists, merge the missing settings from `.env.example` instead of replacing it. Put one generated value in `JWT_SECRET`, set `DOMAIN` and `INITIAL_ADMIN_EMAIL`, and set `INITIAL_ADMIN_TOKEN` to a second long random value. Set `OWNER_EMAIL` to the initial admin email to grant that account the Owner role. Then run:

```sh
docker compose up -d --build
```

Open `https://DOMAIN` and use the bootstrap form with the configured email and token to create the first administrator. Docker keeps MongoDB, uploaded files, and vault files in persistent volumes across container restarts. The app and database ports are not exposed publicly; Caddy serves HTTPS on the VPS. The VPS must remain online for the public site to work, but your personal computer does not need to keep a port open. Use `docker compose down` to stop the stack without deleting its data.

AI features require a valid `OPENAI_API_KEY`; reward credits also need an offerwall and signed postback configuration. Those provider features remain unavailable until configured.

## Imported place workspace

The Windows desktop app can preview and walk through supported geometry from `.rbxl` and `.rbxlx` files. It is not a Roblox runtime: Roblox scripts, linked assets, physics, and game services are not fully converted or executed.

In the Import workspace, choose a local save folder to enable automatic recovery saves every 60 seconds, or use **SAVE RECOVERY NOW**. Recovery files use `.rbxlx` and can be reopened with **LOAD .RBXLX RECOVERY**. They contain the supported geometry and A-Null emulator position/camera state; they are not Roblox DataStore progress files. The current preview supports up to 600 parts.

## AI Studio

The AI section uses the OpenAI API (`gpt-4.1-mini`) for six chat modes, web search, and image understanding; generated images use `gpt-image-2.5-flare`. The OpenAI API is billed separately from ChatGPT subscriptions. Configure `OPENAI_API_KEY` in the server environment. All AI requests require app credits: a chat costs 1 credit, image generation costs 2. OpenAI usage and these internal credits are separate; set provider billing limits and monitor usage.

Users can attach up to four files (20 MB total; 10 MB per file): common images, PDFs, Word/PowerPoint/Excel files, spreadsheets, text, and source code. File contents and prompts are sent to OpenAI. Assistant responses can be downloaded as `.txt`, `.pdf`, or `.zip`; ZIPs include extracted code blocks and research links.

### Reward credits

I recommend a rewarded offerwall or ad partner that supports a signed HTTPS server-to-server postback. Ordinary display ads or a client-side “reward” button are not secure ways to award credits. No ad network is configured by default; enroll with a provider that can generate the documented HMAC-SHA256 callback before exposing rewards.

Set `AI_REWARD_WALL_URL` to the partner’s HTTPS offerwall URL, using `{{USER_ID}}` where its user/sub-ID macro belongs, and set `AI_REWARD_POSTBACK_SECRET` to a random secret of at least 32 characters. Configure successful completions to call `/api/ai/rewards/postback` with `user_id`, a unique `transaction_id`, and `signature`, where `signature` is the lowercase hex HMAC-SHA256 of `user_id.transaction_id.2` using that secret. The endpoint deduplicates transaction IDs and grants 2 credits per verified completion. MongoDB transactions require a replica set (such as MongoDB Atlas).

Ad revenue is not automatically converted to OpenAI balance, and OpenAI bills the server separately. Use the provider’s own spending controls; rewards only cap individual users’ app access. Keep API keys and the postback secret server-side. Do not submit passwords, personal information, or other sensitive files to AI.
