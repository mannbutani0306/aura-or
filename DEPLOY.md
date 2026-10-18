# Deploy

## Vercel

The Vite site and the Express API are deployed together. `api/[...path].ts` forwards `/api/*` requests to the existing API, and `vercel.json` includes the EMS workbook in the serverless function bundle so Insights can use the checked-in 50-case sample when Supabase sample data is unavailable.

1. Import the GitHub repository into Vercel and keep the repository root as the project root.
2. Set the build command to `npm run build` and the output directory to `dist` (also declared in `vercel.json`).
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project environment settings for every environment you deploy. These public client credentials are also read by the API function; never use a service-role key for either variable.
4. Deploy the latest `main` commit. Confirm `/api/health` returns JSON, `/api/state` returns operational or explicitly labeled SIM data, `/api/route?from=A&to=B&k=3` returns routes, and `/api/ems-sample` returns 50 sample cases if the sample table is unavailable.

The API function is stateless and does not run the long-lived simulation clock. For persistent operational writes and automatic dispatch lifecycle simulation, deploy the Express server using the Render or Railway instructions below; configure Supabase before treating any data as live. Without Supabase, fallback operational values are marked SIM and are not persisted between serverless function invocations.

## Render

1. Push the `main` branch to GitHub.
2. Sign in at Render and choose **New +** → **Blueprint**.
3. Connect the AURA GitHub repository and select `main`.
4. Review the single `aura-dispatch` web service from `render.yaml`; choose **Apply**.
5. Open the new service → **Environment** → **Environment Variables** → **Add Environment Variable**.
6. Set `APP_URL` to the exact HTTPS origin shown on the service page, without a trailing path (for example `https://aura-dispatch.onrender.com`). Save; CORS allows only that origin.
7. Set `VITE_SUPABASE_URL` to the Supabase project URL.
8. Set `VITE_SUPABASE_ANON_KEY` to the project's public anon/publishable key. This key is visible to browsers; it is not a substitute for database authorization. Never put a service-role key in the client or in this variable.
9. Set `GEMINI_API_KEY` only if enabling a future Gemini integration. The current application code does not read this variable.
10. Choose **Manual Deploy** → **Deploy latest commit**. The build command is `npm ci && npm run build`; the start command is `npm start`.
11. Wait for the health check to pass at `/api/health`, then open the service URL on desktop and on a phone. Allow the first request to wake a sleeping/free instance.

Render's `VITE_` values are build-time inputs, so changing either Supabase value requires a new deploy. `APP_URL` is a server runtime value; update it if the service's public origin changes.

### Supabase warning

The current demo RLS policy permits anyone with the anon key to write operational tables. This is not suitable for sensitive real dispatch. The next step is Supabase Auth with role-based policies and server-controlled operational writes before real deployment.

## Railway

Connect the GitHub repository to a Railway project and deploy the service as Node. Set the build command to `npm ci && npm run build`, the start command to `npm start`, and health check path to `/api/health`. Add the same four variable names under **Service → Variables**; use the Railway public HTTPS origin as `APP_URL`, then redeploy after setting `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` because they are embedded during build. Leave `GEMINI_API_KEY` empty or omit it until an integration consumes it. The Supabase RLS warning above also applies.