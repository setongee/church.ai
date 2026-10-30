import mongoose from 'mongoose';

// An "Audio Lab" cut: pieces of one session's message chosen by an LLM (or by hand) and stitched
// into a single audio file. Segments are in PLAY order, which need not be the order they were
// spoken in (a viral cut often opens with the punchline).
const segmentSchema = new mongoose.Schema(
  {
    startSec: { type: Number, required: true },
    endSec: { type: Number, required: true },
    role: { type: String, default: 'build' },
    headline: { type: String, default: '' },
    why: { type: String, default: '' },
    text: { type: String, default: '' },
  },
  { _id: true }
);

const audioMergeSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    title: { type: String, default: '' },
    prompt: { type: String, default: '' },
    style: { type: String, enum: ['viral', 'story', 'highlights'], default: 'viral' },
    targetSec: { type: Number, default: 60 },
    // The model's own account of how the cut flows, and what its review pass changed.
    summary: { type: String, default: '' },
    review: { type: String, default: '' },
    segments: { type: [segmentSchema], default: [] },
    status: { type: String, enum: ['planning', 'reviewing', 'rendering', 'done', 'error'], default: 'planning', index: true },
    stage: { type: String, default: '' },
    error: { type: String },
    audioUrl: { type: String },
    durationSec: { type: Number },
  },
  { timestamps: true }
);

export const AudioMerge = mongoose.model('AudioMerge', audioMergeSchema);
