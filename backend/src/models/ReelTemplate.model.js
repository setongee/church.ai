import mongoose from 'mongoose';

// A user-made reel template: one of the built-in layouts plus their own colours, font,
// background image, which labels to show, and a footer line. `theme` is validated/normalised
// by remotion/templates.js (normaliseTheme) before it is stored or rendered.
const reelTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    theme: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const ReelTemplate = mongoose.model('ReelTemplate', reelTemplateSchema);
