import mongoose from 'mongoose';

// A merged reel: several clips from one session (e.g. the four points of a list) rendered as
// one longer video with a title card and closing card.
const segmentSchema = new mongoose.Schema(
  {
    headline: { type: String, required: true, trim: true },
    takeaway: { type: String, default: '', trim: true },
    startSec: { type: Number, required: true },
    endSec: { type: Number, required: true },
  },
  { _id: true }
);

const compilationSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    title: { type: String, required: true, trim: true },
    kicker: { type: String, default: '', trim: true },
    kind: { type: String, enum: ['key-points', 'top-moments', 'custom'], default: 'key-points' },
    prompt: { type: String, default: '' },
    // The length the user asked for when it was generated (seconds).
    targetSec: { type: Number },
    template: { type: String, default: 'builtin:kinetic' },
    segments: { type: [segmentSchema], default: [] },
    status: { type: String, enum: ['draft', 'queued', 'rendering', 'done', 'error'], default: 'draft', index: true },
    progress: { type: Number, default: 0 },
    error: { type: String },
    videoUrl: { type: String },
    // Final mixed audio (voice + music + effects) when there is any; absent = the plain voice.
    mixUrl: { type: String },
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

export const Compilation = mongoose.model('Compilation', compilationSchema);
