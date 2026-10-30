import mongoose from 'mongoose';

// Pictures, GIFs and videos uploaded for the Present screen. `purpose` separates full-screen media
// from backgrounds that sit behind the text.
const presentMediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    name: { type: String, default: '' },
    type: { type: String, enum: ['image', 'gif', 'video'], required: true },
    purpose: { type: String, enum: ['media', 'background'], default: 'media', index: true },
    mime: { type: String, default: '' },
    size: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const PresentMedia = mongoose.model('PresentMedia', presentMediaSchema);
