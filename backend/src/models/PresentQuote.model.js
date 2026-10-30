import mongoose from 'mongoose';

// A quote or excerpt saved for the Present screen (typed in, or copied from the app's own
// generated quotes).
const presentQuoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    attribution: { type: String, default: '', trim: true },
    // An optional picture/video/colour behind this quote ({ type: image|video|gradient|color, value }).
    background: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

export const PresentQuote = mongoose.model('PresentQuote', presentQuoteSchema);
