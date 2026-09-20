import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
