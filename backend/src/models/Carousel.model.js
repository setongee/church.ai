import mongoose from 'mongoose';

// An Instagram carousel: an ordered list of up to 10 slides. A slide is either one of the app's
// designs (edited in the design editor, exported to an image when needed), an uploaded image, or a
// video. `recipe` remembers how it was generated so it can be rebuilt for another service.
const slideSchema = new mongoose.Schema({
  kind: { type: String, enum: ['design', 'image', 'video'], required: true },
  design: { type: mongoose.Schema.Types.ObjectId, ref: 'Design' },
  // True when the carousel created the design itself (deleted along with the carousel).
  owned: { type: Boolean, default: false },
  imageUrl: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  label: { type: String, default: '' },
});

const carouselSchema = new mongoose.Schema(
  {
    title: { type: String, default: 'Untitled carousel' },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', index: true },
    width: { type: Number, default: 1080 },
    height: { type: Number, default: 1350 },
    caption: { type: String, default: '' },
    slides: { type: [slideSchema], default: [] },
    // Saved as a reusable carousel recipe (listed when starting a new carousel).
    savedAsRecipe: { type: Boolean, default: false, index: true },
    recipe: {
      type: new mongoose.Schema(
        {
          source: { type: String, default: 'keyPoints' },
          count: { type: Number, default: 5 },
          templateId: { type: String, default: '' },
          coverTemplateId: { type: String, default: '' },
          cover: { type: Boolean, default: true },
          closing: { type: Boolean, default: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
    instagramMediaId: { type: String },
    instagramPermalink: { type: String },
    instagramPublishedAt: { type: Date },
  },
  { timestamps: true }
);

export const Carousel = mongoose.model('Carousel', carouselSchema);
