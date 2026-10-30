import mongoose from 'mongoose';

// A time-boxed block of work on the team board. Admins create sprints; tasks belong to one.
const sprintSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    goal: { type: String, default: '', maxlength: 600 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['planned', 'active', 'completed'], default: 'planned', index: true },
    completedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const Sprint = mongoose.model('Sprint', sprintSchema);
