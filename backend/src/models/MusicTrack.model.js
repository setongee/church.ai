import mongoose from 'mongoose';

// A background-music track the user uploaded. (The built-in beds are generated on disk and are
// not stored here - they are identified as "builtin:<key>".)
const musicTrackSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    filename: { type: String, required: true },
  },
  { timestamps: true }
);

export const MusicTrack = mongoose.model('MusicTrack', musicTrackSchema);
