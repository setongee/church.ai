import mongoose from 'mongoose';

// A reel (and optionally a carousel) built from photos - a service recap, an event, a
// testimony - rather than from a recording.
const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    // Set when the photo was run through AI editing: the untouched upload, so it can be restored.
    originalUrl: { type: String },
    enhancedWith: { type: String },
  },
  { _id: true }
);

const slideSchema = new mongoose.Schema(
  {
    layout: { type: String, default: 'hero-left' },
    images: { type: [String], default: [] },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    // Length of this slide's video, in seconds.
    lengthSec: { type: Number, default: 8 },
  },
  { _id: true }
);

const photoReelSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    template: { type: String, default: 'collage' },
    images: { type: [imageSchema], default: [] },
    // Title shown over the opening photos.
    intro: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: '' },
      subtitle: { type: String, default: '' },
    },
    // Optional caption overlay across the bottom of the photos (and of the carousel photo slides).
    lowerThird: {
      style: { type: String, enum: ['none', 'bar', 'block', 'strip'], default: 'none' },
      title: { type: String, default: '' },
      subtitle: { type: String, default: '' },
      left: { type: String, default: '' },
      right: { type: String, default: '' },
    },
    // Total length of the reel in seconds. The photos share it equally, however many there are.
    lengthSec: { type: Number, default: 8 },
    // (Older reels stored seconds-per-photo instead; the length now drives timing.)
    cycleSec: { type: Number, default: 2.4 },
    // Optional colour overrides of the template's palette.
    colors: { accent: { type: String, default: '' }, tintA: { type: String, default: '' }, tintB: { type: String, default: '' } },
    // Text overrides, sizes, music and the closing card (same shape as voice reels).
    options: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    status: { type: String, enum: ['draft', 'queued', 'rendering', 'done', 'error'], default: 'draft', index: true },
    progress: { type: Number, default: 0 },
    error: { type: String },
    videoUrl: { type: String },
    mixUrl: { type: String },
    durationSec: { type: Number },
    instagramMediaId: { type: String },
    instagramPermalink: { type: String },
    instagramPublishedAt: { type: Date },
    renderedAt: { type: Date },

    carousel: {
      slides: { type: [slideSchema], default: [] },
      // One MP4 per slide once rendered (older carousels may hold PNGs).
      renderedUrls: { type: [String], default: [] },
      renderedAt: { type: Date },
      status: { type: String, enum: ['idle', 'queued', 'rendering', 'done', 'error'], default: 'idle' },
      progress: { type: Number, default: 0 },
      error: { type: String },
    },
  },
  { timestamps: true }
);

export const PhotoReel = mongoose.model('PhotoReel', photoReelSchema);
