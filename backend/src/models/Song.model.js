import mongoose from 'mongoose';

// A song for the Present screen. `lyrics` is plain text: blank lines separate slides, and a line
// like "[Chorus]" or "Verse 2:" on its own names the slide that follows it.
const songSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    author: { type: String, default: '', trim: true },
    lyrics: { type: String, default: '' },
    // Hymns live in their own panel; `number` is the hymn-book number (a string, so "12a" works).
    category: { type: String, enum: ['song', 'hymn'], default: 'song', index: true },
    number: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

export const Song = mongoose.model('Song', songSchema);
