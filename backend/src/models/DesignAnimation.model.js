import mongoose from 'mongoose';

// An animated (looping video) version of a design from the image editor. The still design is
// untouched; each animation is a separate render with its own effect and length.
const designAnimationSchema = new mongoose.Schema(
  {
    design: { type: mongoose.Schema.Types.ObjectId, ref: 'Design', required: true, index: true },
    effect: { type: String, default: 'rise' },
    lengthSec: { type: Number, default: 6 },
    speed: { type: Number, default: 0.9 },
    stagger: { type: Number, default: 0.4 },
    loop: { type: Boolean, default: true },
    bgMotion: { type: Boolean, default: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    // The design split into a background and one transparent PNG per element (stored under uploads/design-anim/<id>/).
    background: { type: String, required: true },
    layers: { type: [{ src: String, x: Number, y: Number, w: Number, h: Number, kind: String, label: String, _id: false }], default: [] },
    status: { type: String, enum: ['draft', 'queued', 'rendering', 'done', 'error'], default: 'queued', index: true },
    progress: { type: Number, default: 0 },
    error: { type: String },
    videoUrl: { type: String },
    durationSec: { type: Number },
  },
  { timestamps: true }
);

export const DesignAnimation = mongoose.model('DesignAnimation', designAnimationSchema);
