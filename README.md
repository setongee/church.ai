# Live Transcription & Quotes

Real-time transcription for live sermons/services. Streams microphone audio to the backend,
transcribes it live via Deepgram, and uses an OpenRouter LLM to continuously pull out:

- Punchy, image-ready quotes (shown immediately in a side panel with copy buttons)
- Key points, topics, scriptures, and proclamations
- A final structured summary once the service ends

## Stack

- **Backend**: Node.js, Express, Socket.IO, Mongoose (MongoDB), Deepgram SDK (live STT), OpenRouter (LLM)
- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, socket.io-client

## Setup

### 1. MongoDB

Make sure a MongoDB instance is running locally (or point `MONGODB_URI` at Atlas/another host).

### 2. Backend

```bash
cd backend
cp .env.example .env   # fill in DEEPGRAM_API_KEY and OPENROUTER_API_KEY
npm install
npm run dev
```

Runs on `http://localhost:5050` by default.

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Runs on `http://localhost:3000` by default (adjust `NEXT_PUBLIC_API_URL` /
`NEXT_PUBLIC_SOCKET_URL` in `.env.local` if the backend runs elsewhere, and set the backend's
`FRONTEND_ORIGIN` to match whatever port the frontend actually runs on).

## API keys needed

- **Deepgram** (`DEEPGRAM_API_KEY`) — live speech-to-text streaming. https://console.deepgram.com
- **OpenRouter** (`OPENROUTER_API_KEY`) — LLM refinement for quotes/insights/summary. Defaults to
  `google/gemini-2.5-flash-lite`, a cheap/fast model well suited to structured extraction; swap
  `OPENROUTER_MODEL` for any other slug from https://openrouter.ai/models. Model availability on
  OpenRouter changes over time — if you get a "No endpoints found" error, check that slug is still
  live and pick a current replacement.

## How it works

1. Starting a service (title + preacher required) creates a `Session` and opens a page with
   mic controls.
2. Clicking "Start streaming" captures mic audio (`MediaRecorder`, WebM/Opus) and streams it over
   a WebSocket to the backend in ~250ms chunks.
3. The backend forwards audio to a per-session Deepgram live connection and gets back
   interim/final transcript chunks, broadcasting them to the frontend in real time and persisting
   final segments to MongoDB.
4. As final transcript accumulates, two independent rolling-window checks fire against
   OpenRouter: a frequent, small-window check for quotable lines (punchy quotes + an image-style
   prompt), and a less frequent, larger-window check for key points/topics/scriptures/proclamations.
   Both dedupe against recently-seen output so nothing repeats.
5. Ending the service snapshots the full transcript into one final OpenRouter call that produces
   a structured overview/topics/keyPoints/scriptures/proclamations summary saved on the session.
