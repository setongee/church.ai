import mongoose from 'mongoose';

// The image bank: every picture the user uploaded or generated in the design editor, kept so it
// can be reused across designs. `lower-third` assets are overlay graphics (shown under Elements,
// not in the gallery).
const imageAssetSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    kind: { type: String, enum: ['upload', 'ai', 'lower-third', 'present-bg', 'present-image'], required: true, index: true },
    name: { type: String, default: '' },
    prompt: { type: String, default: '' },
  },
  { timestamps: true }
);

export const ImageAsset = mongoose.model('ImageAsset', imageAssetSchema);
