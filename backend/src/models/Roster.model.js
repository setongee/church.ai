import mongoose from 'mongoose';
import { ROLES } from './User.model.js';

// Who is doing what for one service. A person can be on several roles and a role can have several people.
const rosterSchema = new mongoose.Schema(
  {
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, unique: true },
    assignments: {
      type: [
        new mongoose.Schema(
          {
            role: { type: String, enum: ROLES, required: true },
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            // When this person was told about this assignment (so people added later can be emailed on their own).
            notifiedAt: { type: Date, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    note: { type: String, default: '' },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Roster = mongoose.model('Roster', rosterSchema);
