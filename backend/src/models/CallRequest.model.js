import mongoose from 'mongoose';

// A member's request to start a group call in a room. Only admins start calls directly; everyone else asks, and an
// admin approves or declines.
const callRequestSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamRoom', required: true, index: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'approved', 'declined', 'cancelled'], default: 'pending', index: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const CallRequest = mongoose.model('CallRequest', callRequestSchema);
