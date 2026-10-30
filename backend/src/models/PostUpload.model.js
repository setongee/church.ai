import mongoose from 'mongoose';

// A video or picture someone uploads to post on Instagram: the file (converted so Instagram accepts it), what the AI
// heard in it, the caption options it wrote, and where it ended up once published.
const optionSchema = new mongoose.Schema({ label: String, caption: String, why: String }, { _id: false });

const postUploadSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['video', 'image'], required: true },
    title: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mediaUrl: { type: String, default: '' }, // /uploads/post-uploads/<id>.mp4 (or .jpg) - what gets published
    posterUrl: { type: String, default: '' },
    durationSec: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    // What the speech in the video says (empty for pictures or silent videos).
    transcript: { type: String, default: '' },
    summary: { type: String, default: '' },
    // Context the person gave the AI ("this is the Friday youth night recap") and the tone they asked for.
    notes: { type: String, default: '' },
    tone: { type: String, default: '' },
    options: { type: [optionSchema], default: [] },
    caption: { type: String, default: '' },
    aiWritten: { type: Boolean, default: false },
    aiIssue: { type: String, default: '' }, // why the captions came from the built-in writer instead of the AI
    status: { type: String, enum: ['processing', 'ready', 'error'], default: 'processing', index: true },
    stage: { type: String, default: '' },
    error: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    instagramMediaId: { type: String },
    instagramPermalink: { type: String },
    instagramPublishedAt: { type: Date },
  },
  { timestamps: true }
);

export const PostUpload = mongoose.model('PostUpload', postUploadSchema);
