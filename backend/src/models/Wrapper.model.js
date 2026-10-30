import mongoose from 'mongoose';

// A service wrapper: one named bundle of how a service should look and feel - the themes for scripture, prayer and
// songs, the announcement and quote looks, the chat skin and the presenter layout. Applying it sets all of them at once.
const ref = { type: mongoose.Schema.Types.ObjectId, ref: 'SceneTemplate', default: null };
const wrapperSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    scripture: ref, // a template: its Scripture section (or its default look) is used for scripture
    prayer: ref,
    song: ref,
    background: { type: mongoose.Schema.Types.Mixed, default: null }, // { type, value } or null (keep the screen's own)
    font: { type: String, default: '' },
    weight: { type: Number, default: null },
    announcementTemplate: { type: String, default: '' }, // one of the announcement template ids, '' = leave it
    quoteLayout: { type: String, default: '' },
    chatSkin: { type: String, default: '' },
    layout: { type: String, default: '' }, // presenter layout: classic | stage | mirror
  },
  { timestamps: true, minimize: false }
);

export const Wrapper = mongoose.model('Wrapper', wrapperSchema);
