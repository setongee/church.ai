import mongoose from 'mongoose';

// A reel made by one of the browser-rendered Custom templates (e.g. the Recap Reel). The video
// is rendered in the user's browser and uploaded once finished, so it is always "done" here.
const customReelSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    template: { type: String, default: 'recap-reel' },
    status: { type: String, enum: ['done'], default: 'done' },
    videoUrl: { type: String, required: true },
    durationSec: { type: Number },
    sizeBytes: { type: Number },
    // The inputs the reel was made with (text fields and sliders only - no media), for reference.
    settings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

export const CustomReel = mongoose.model('CustomReel', customReelSchema);
