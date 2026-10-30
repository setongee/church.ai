# Deploying FAFC Media Engine

Three pieces: MongoDB Atlas (database), the backend (Docker, needs a persistent volume), the frontend (Vercel).

## 1. Database
Create a free MongoDB Atlas cluster, allow access from anywhere (0.0.0.0/0), copy the connection string into `MONGODB_URI`.

## 2. Backend (Docker: `backend/Dockerfile`)
- Host on Railway, Render or Fly.io. Root directory: `backend`.
- Attach ONE persistent volume mounted at `/data` (uploads and downloaded Bibles live there).
- It listens on `PORT` (defaults to 8080 in the image); the host must allow WebSockets.
- Environment variables (copy values from your local `backend/.env`, never commit that file):
  `MONGODB_URI`, `FRONTEND_ORIGIN` (the Vercel URL), `PUBLIC_BASE_URL` (this backend's own https URL),
  `INSTAGRAM_PUBLIC_BASE_URL` (same), `DEEPGRAM_API_KEY`, `OPENROUTER_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`,
  `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `SMTP_*`, `MAIL_FROM`, `MULTITEXTER_*`, `CLOUDINARY_*`.
- Use at least 2 GB RAM: reel rendering runs headless Chrome.

## 3. Frontend (Vercel)
- Root directory: `frontend`. Environment variables (set before the build):
  `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL`, both the backend's https URL.
- Then add the Vercel URL to the backend's `FRONTEND_ORIGIN` (or `CORS_ORIGINS`).

## 4. After it is live
- Rotate the Zoho password to an app password.
- Remove the dead ngrok URL from `INSTAGRAM_PUBLIC_BASE_URL`.
- Open the site on a phone to check the install prompt, and try a test Instagram post.
