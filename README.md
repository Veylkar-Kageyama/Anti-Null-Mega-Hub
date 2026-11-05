# Anti-Null-Mega-Hub
The Anti-Null Realm awaits your creations.

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
