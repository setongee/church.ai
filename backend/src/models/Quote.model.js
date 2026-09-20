import mongoose from 'mongoose';

const quoteSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    text: { type: String, required: true },
    sourceText: { type: String },
    imagePrompt: { type: String },
    // Ready-to-post social caption (hook + soft CTA) generated alongside the quote text -
    // distinct from `text`, which is what actually goes on the image.
    caption: { type: String },
    groupId: { type: String, index: true },
    // Per-quote override of the service's default template image; falls back to the parent
    // service's portrait/landscape template when unset.
    customImageUrl: { type: String },
    // Serialized editor state (Fabric.js canvas JSON) so reopening the image editor restores
    // exact text position/font/color/etc, plus the last rendered PNG export.
    editorState: { type: mongoose.Schema.Types.Mixed },
    exportedImageUrl: { type: String },
    // Instagram publish status, set once `publishToInstagram` succeeds - lets the review page
    // show "Posted" (with a link) instead of re-posting the same image on a second click.
    instagramMediaId: { type: String },
    instagramPermalink: { type: String },
    instagramPublishedAt: { type: Date },
  },
  { timestamps: true }
);

export const Quote = mongoose.model('Quote', quoteSchema);
