import mongoose from 'mongoose';

// A scripture the presenter saved for later ("scripture box"): the exact text that was on the screen, so it
// still reads the same if the Bible version is changed or removed.
const scriptureBoxSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, trim: true },
    version: { type: String, default: '' },
    text: { type: String, required: true },
    highlights: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

export const ScriptureBox = mongoose.model('ScriptureBox', scriptureBoxSchema);
