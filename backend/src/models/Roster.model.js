import mongoose from 'mongoose';
import { ROLES } from './User.model.js';

// Who is doing what for one service, and for which part of it. A person can be on several jobs and a job can have several people.
const rosterSchema = new mongoose.Schema(
  {
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, unique: true },
    assignments: {
      type: [
        new mongoose.Schema(
          {
            role: { type: String, enum: ROLES, required: true },
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            // One of this service's sessions (see `sessions` below), or null for the whole service.
            session: { type: mongoose.Schema.Types.ObjectId, default: null },
            // When this person was told about this assignment (so people added later can be emailed on their own).
            notifiedAt: { type: Date, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    // The parts of the service the team is split across (Praise & Worship, Word, ...), in order. A job can be given for the
    // whole service or for one session, so who presents the praise and who presents the word can differ.
    sessions: { type: [new mongoose.Schema({ name: { type: String, required: true, trim: true, maxlength: 60 } })], default: [] },
    note: { type: String, default: '' },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Roster = mongoose.model('Roster', rosterSchema);
