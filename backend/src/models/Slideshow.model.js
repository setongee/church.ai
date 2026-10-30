import mongoose from 'mongoose';

// A quote slide show: quotes shown one after another on a timer, optionally looping, optionally ending
// on a closing slide. Order is the order of `quotes`.
const quoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    attribution: { type: String, default: '' },
    background: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const slideshowSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quotes: { type: [quoteSchema], default: [] },
    seconds: { type: Number, default: 8 },
    loop: { type: Boolean, default: false },
    // A slide at the very end ("Thank you", "Amen", church name...).
    closing: {
      type: new mongoose.Schema(
        {
          enabled: { type: Boolean, default: false },
          text: { type: String, default: '' },
          subtext: { type: String, default: '' },
          background: { type: mongoose.Schema.Types.Mixed, default: null },
        },
        { _id: false }
      ),
      default: () => ({ enabled: false, text: '', subtext: '', background: null }),
    },
    // Used behind every quote that has no background of its own.
    background: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

export const Slideshow = mongoose.model('Slideshow', slideshowSchema);
