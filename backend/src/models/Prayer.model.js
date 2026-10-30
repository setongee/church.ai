import mongoose from 'mongoose';

// A prayer to put on screen. A blank line in `body` starts a new slide.
const prayerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
    // An optional picture/video/colour behind this prayer ({ type: image|video|gradient|color, value }).
    background: { type: mongoose.Schema.Types.Mixed, default: null },
    // A prayer template (a SceneTemplate of kind 'prayer'): where the text sits, its size, alignment and backdrop.
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'SceneTemplate', default: null },
  },
  { timestamps: true }
);

export const Prayer = mongoose.model('Prayer', prayerSchema);
