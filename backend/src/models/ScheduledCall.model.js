import mongoose from 'mongoose';

// A group call an admin has set for a time. When the time comes the server starts the call and pings the room
// (see callScheduler.service.js); the admin can still re-ping whoever hasn't joined.
const scheduledCallSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamRoom', required: true, index: true },
    title: { type: String, default: '', trim: true, maxlength: 80 },
    startAt: { type: Date, required: true, index: true },
    // Only these people (besides the host) are invited. Empty = everyone in the room.
    invited: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['scheduled', 'started', 'missed', 'cancelled'], default: 'scheduled', index: true },
    callId: { type: String, default: '' },
  },
  { timestamps: true }
);

export const ScheduledCall = mongoose.model('ScheduledCall', scheduledCallSchema);
