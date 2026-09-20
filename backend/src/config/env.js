import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: process.env.PORT || 4000,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/live-transcription',
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite',
  openrouterSiteUrl: process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
  openrouterAppName: process.env.OPENROUTER_APP_NAME || 'Live Transcription Quotes',
  // Instagram Graph API - publishing to a Business/Creator account. See backend/.env.example
  // for the one-time setup steps (Meta app, linked Page, long-lived access token).
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
  instagramBusinessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '',
  // Instagram's servers fetch the image themselves, so exported images (served at a relative
  // /uploads/... path) need to be turned into a URL reachable from the public internet - this
  // is that base (a deployed backend URL, or an ngrok/tunnel URL in local dev).
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  // Cloudinary - stores the mp3 recording of each session once streaming stops.
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
};
