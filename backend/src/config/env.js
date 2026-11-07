import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: process.env.PORT || 4000,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  // More origins allowed to call the API (comma-separated) - e.g. a tunnel URL while testing on a phone.
  extraOrigins: (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/live-transcription',
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite',
  // Longer, structured writing (message notes) can use a stronger model than the live quote/insight calls.
  // Translating lyrics (Yoruba, Igbo, Hausa…) needs a stronger model than the cheap default. Flash is near Pro's quality
  // on these and ~8x faster; set OPENROUTER_TRANSLATE_MODEL=google/gemini-2.5-pro for the most careful wording.
  openrouterTranslateModel: process.env.OPENROUTER_TRANSLATE_MODEL || 'google/gemini-2.5-flash',
  openrouterNotesModel: process.env.OPENROUTER_NOTES_MODEL || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite',
  // Dedicated OpenRouter Image API model used by the editor's AI image generation.
  // Audio Lab plans cuts with the strongest model available; it reads a whole message at once.
  // Content calendar planning writes a whole calendar at once, so it uses a strong writer (falls back to the notes model).
  contentPlanModel: process.env.CONTENT_PLAN_MODEL || process.env.AUDIO_LAB_SUGGEST_MODEL || 'anthropic/claude-sonnet-5.5',
  // Spotting a verse said in the preacher's own words needs good judgement, quickly: a strong, fast model first, the cheap one as a fallback.
  paraphraseModel: process.env.PARAPHRASE_MODEL || 'anthropic/claude-sonnet-5.5',
  audioLabModel: process.env.AUDIO_LAB_MODEL || 'anthropic/claude-fable-5.1',
  audioLabSuggestModel: process.env.AUDIO_LAB_SUGGEST_MODEL || 'anthropic/claude-sonnet-5.5',
  audioLabFallbackModel: process.env.AUDIO_LAB_FALLBACK_MODEL || 'anthropic/claude-opus-5.5',
  openrouterImageModel: process.env.OPENROUTER_IMAGE_MODEL || 'openai/gpt-image-2',
  openrouterSiteUrl: process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
  openrouterAppName: process.env.OPENROUTER_APP_NAME || 'FAFC Media Engine',
  // Instagram Graph API - publishing to a Business/Creator account. See backend/.env.example
  // for the one-time setup steps (Meta app, linked Page, long-lived access token).
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
  instagramBusinessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '',
  // Instagram's servers fetch the image themselves, so exported images (served at a relative
  // /uploads/... path) need to be turned into a URL reachable from the public internet - this
  // is that base (a deployed backend URL, or an ngrok/tunnel URL in local dev).
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  // Base URL Instagram's servers use to fetch media. Kept separate so a dev tunnel (ngrok) is only
  // used for publishing, not for local previews/renders. Falls back to PUBLIC_BASE_URL.
  instagramPublicBaseUrl: process.env.INSTAGRAM_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || '',
  // Web push (alerts that reach phones and computers even when the app is closed). Generate once with
  // `npx web-push generate-vapid-keys`; leave empty to run without push.
  vapid: { publicKey: process.env.VAPID_PUBLIC_KEY || '', privateKey: process.env.VAPID_PRIVATE_KEY || '', subject: process.env.VAPID_SUBJECT || 'mailto:hello@fafc.com.ng' },
  // Login: a signed-in device that has made no request for this long no longer blocks a new login.
  authIdleHours: Number(process.env.AUTH_IDLE_HOURS) || 12,
  // Outgoing email (roster assignments). RESEND_API_KEY sends over HTTPS (use this on Railway, which blocks SMTP);
  // otherwise SMTP_HOST. Leave both empty to run without email.
  resendApiKey: process.env.RESEND_API_KEY || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || '',
  },
  // SMS via MultiTexter (roster assignments are texted to people who have a phone number).
  multitexter: { apiKey: process.env.MULTITEXTER_API_KEY || '', senderName: process.env.MULTITEXTER_SENDER_NAME || '' },
  // Cloudinary - stores the mp3 recording of each session once streaming stops.
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
};
