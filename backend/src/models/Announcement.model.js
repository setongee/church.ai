import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    // How it looks on screen (one of the announcement templates), a small label above the title, and its accent colour.
    template: { type: String, default: 'classic' },
    kicker: { type: String, default: '' },
    accent: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Announcement = mongoose.model('Announcement', announcementSchema);
