import mongoose from 'mongoose';

// One planned post on the content calendar: from idea, through drafting and review, to scheduled and published.
const contentItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    caption: { type: String, default: '', maxlength: 2200 },
    format: { type: String, enum: ['reel', 'post', 'carousel', 'story', 'video', 'other'], default: 'post' },
    platform: { type: String, enum: ['instagram', 'facebook', 'youtube', 'tiktok', 'other'], default: 'instagram' },
    status: { type: String, enum: ['idea', 'drafting', 'review', 'ready', 'scheduled', 'publishing', 'published', 'failed'], default: 'idea', index: true },
    scheduledAt: { type: Date, default: null, index: true }, // when it should go out
    publishedAt: { type: Date, default: null },
    campaign: { type: String, default: '', maxlength: 80 }, // a theme/series name, also drives the colour
    notes: { type: String, default: '', maxlength: 4000 },
    owners: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] }, // who is responsible
    // The board task that is the work for this item (the task points back at the item).
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    // The uploaded video/picture (from Upload & post) that goes out at the scheduled time.
    upload: { type: mongoose.Schema.Types.ObjectId, ref: 'PostUpload', default: null },
    instagramMediaId: { type: String, default: '' },
    instagramPermalink: { type: String, default: '' },
    error: { type: String, default: '' }, // why the last automatic posting attempt failed
    publishStartedAt: { type: Date, default: null }, // set while status is 'publishing' (so a crash mid-post can be spotted)
    reminderSent: { type: Boolean, default: false }, // the 'add media' nudge has gone out (once per item)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const ContentItem = mongoose.model('ContentItem', contentItemSchema);
