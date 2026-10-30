import mongoose from 'mongoose';

// The written study version of a sermon: titled, broken into topics with points and scriptures,
// plus the follow-through (prayer points, further reading, a Monday-Saturday plan). Rendered into
// slides / a PDF book on the client, so everything the layout needs lives here and is editable.
const pointSchema = new mongoose.Schema({ text: { type: String, default: '' }, refs: { type: [String], default: [] } }, { _id: false });
const sectionSchema = new mongoose.Schema(
  {
    heading: { type: String, default: '' },
    summary: { type: String, default: '' },
    points: { type: [pointSchema], default: [] },
    pullQuote: { type: String, default: '' },
  },
  { _id: true }
);
const scriptureSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true },
    // Full verse text from the chosen translation (looked up, not written by the model).
    text: { type: String, default: '' },
    // The preacher read these words out: the full quote is shown inline where it was used.
    quoted: { type: Boolean, default: false },
    use: { type: String, default: '' },
    verified: { type: Boolean, default: false },
  },
  { _id: false }
);
const daySchema = new mongoose.Schema(
  {
    day: { type: String, default: '' },
    // ISO date (YYYY-MM-DD) of that day in the week after the service.
    date: { type: String, default: '' },
    title: { type: String, default: '' },
    kind: { type: String, enum: ['read', 'pray', 'reflect', 'act', 'share', 'memorize', 'review'], default: 'reflect' },
    action: { type: String, default: '' },
    scripture: { type: String, default: '' },
  },
  { _id: false }
);

const messageNotesSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, unique: true },
    title: { type: String, default: '' },
    preacher: { type: String, default: '' },
    // ISO date (YYYY-MM-DD) of the service.
    date: { type: String, default: '' },
    translation: { type: String, enum: ['kjv', 'web'], default: 'kjv' },
    hook: { type: String, default: '' },
    bigIdea: { type: String, default: '' },
    scriptures: { type: [scriptureSchema], default: [] },
    sections: { type: [sectionSchema], default: [] },
    closing: { type: String, default: '' },
    prayerPoints: { type: [new mongoose.Schema({ text: String, include: { type: Boolean, default: true } }, { _id: false })], default: [] },
    furtherReading: { type: [new mongoose.Schema({ ref: String, why: String }, { _id: false })], default: [] },
    plan: {
      type: new mongoose.Schema({ theme: { type: String, default: '' }, target: { type: String, default: '' }, days: { type: [daySchema], default: [] } }, { _id: false }),
      default: () => ({ theme: '', target: '', days: [] }),
    },
    // Cover: type only, or a picture behind the title (generated, uploaded or picked from the gallery).
    coverMode: { type: String, enum: ['text', 'image'], default: 'text' },
    coverImageUrl: { type: String, default: '' },
    coverPrompt: { type: String, default: '' },
    // Typefaces chosen by the user; empty = the theme's own.
    fonts: {
      type: new mongoose.Schema({ head: { type: String, default: '' }, body: { type: String, default: '' } }, { _id: false }),
      default: () => ({ head: '', body: '' }),
    },
    // The closing page's "join us" details. Blank fields fall back to the Brand page.
    endInfo: {
      type: new mongoose.Schema(
        { serviceTimes: { type: String, default: '' }, venue: { type: String, default: '' }, contact: { type: String, default: '' }, note: { type: String, default: '' } },
        { _id: false }
      ),
      default: () => ({ serviceTimes: '', venue: '', contact: '', note: '' }),
    },
    // Where to listen to the full message (Spotify, YouTube, a podcast page...).
    messageLink: { type: String, default: '' },
  },
  { timestamps: true }
);

export const MessageNotes = mongoose.model('MessageNotes', messageNotesSchema);
