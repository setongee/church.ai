import mongoose from 'mongoose';

const teamMessageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamRoom', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // text (the default), a sticker (its id in `sticker`) or a voice note (a converted .m4a in `audioUrl`).
    kind: { type: String, enum: ['text', 'sticker', 'voice'], default: 'text' },
    text: { type: String, default: '', maxlength: 4000 },
    sticker: { type: String, default: '' },
    audioUrl: { type: String, default: '' },
    audioDur: { type: Number, default: 0 },
    // People tagged with @name, and whether @all was used.
    mentions: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    mentionAll: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    reactions: { type: [new mongoose.Schema({ emoji: String, users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] }, { _id: false })], default: [] },
  },
  { timestamps: true }
);
teamMessageSchema.index({ room: 1, createdAt: -1 });

export const TeamMessage = mongoose.model('TeamMessage', teamMessageSchema);
