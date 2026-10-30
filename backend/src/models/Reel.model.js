import mongoose from 'mongoose';

// One reel = one highlight ("point") from a session's audio, cut to a clip and rendered to a
// vertical video with animated text over the clip's own audio.
const reelSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    // 1-based position among the session's points, in the order they occur in the audio.
    order: { type: Number, required: true },
    headline: { type: String, required: true, trim: true },
    takeaway: { type: String, default: '', trim: true },
    startSec: { type: Number, required: true },
    endSec: { type: Number, required: true },
    // A "full message" reel: a long stretch (up to 5 minutes) kept whole instead of a short highlight.
    full: { type: Boolean, default: false },
    // Pass-through render options (kept small and optional so new templates can add their own).
    // A built-in id ("builtin:minimal") or the _id of a custom ReelTemplate.
    template: { type: String, default: 'builtin:kinetic' },
    status: {
      type: String,
      enum: ['draft', 'queued', 'rendering', 'done', 'error'],
      default: 'draft',
      index: true,
    },
    progress: { type: Number, default: 0 },
    error: { type: String },
    videoUrl: { type: String },
    // Final mixed audio (voice + music + effects) when there is any; absent = the plain voice.
    mixUrl: { type: String },
    clipUrl: { type: String },
    // Text overrides, size multipliers, show/hide switches, music and sound effects. Validated by
    // reelOptions.service.js (sanitizeOptions).
    options: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    // Length of the finished video in seconds (after speed and pause cutting).
    durationSec: { type: Number },
    instagramMediaId: { type: String },
    instagramPermalink: { type: String },
    instagramPublishedAt: { type: Date },
    renderedAt: { type: Date },
  },
  { timestamps: true }
);

export const Reel = mongoose.model('Reel', reelSchema);
