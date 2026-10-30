import mongoose from 'mongoose';

const designSchema = new mongoose.Schema(
  {
    // Optional: standalone designs from the studio belong to no session.
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', index: true },
    title: { type: String, default: 'Untitled design' },
    source: { type: String, enum: ['blank', 'quote', 'post'], default: 'blank' },
    sourceId: { type: String },
    text: { type: String, default: '' },
    width: { type: Number, default: 1080 },
    height: { type: Number, default: 1350 },
    // Serialized editor state (canvas JSON) so reopening restores every layer exactly.
    editorState: { type: mongoose.Schema.Types.Mixed },
    // Initial background image the editor should use the first time the design is opened.
    backgroundUrl: { type: String },
    exportedImageUrl: { type: String },
    // Tagged for the Present screen: shows up under Media > From the app, with its animations.
    presentation: { type: Boolean, default: false, index: true },
    imagePrompt: { type: String },
    caption: { type: String },
    generatedImages: { type: [String], default: [] },
    instagramMediaId: { type: String },
    instagramPermalink: { type: String },
    instagramPublishedAt: { type: Date },
  },
  { timestamps: true }
);

designSchema.index({ session: 1, source: 1, sourceId: 1 });

export const Design = mongoose.model('Design', designSchema);
