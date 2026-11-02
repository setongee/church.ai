import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // The day of the service (shown on the team's calendar). Optional.
    date: { type: Date, default: null },
    // Service mode: an admin or service manager starts the service on the day. While it is on, the people rostered for it
    // see it live on their dashboard; whole-service people are limited to their job straight away, and people rostered for
    // one session are limited while that session is the active one (see access.service.js).
    live: {
      type: new mongoose.Schema(
        {
          on: { type: Boolean, default: false },
          startedAt: { type: Date, default: null },
          startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          activeSession: { type: mongoose.Schema.Types.ObjectId, default: null }, // one of the roster's sessions
        },
        { _id: false }
      ),
      default: () => ({ on: false }),
    },
    portraitTemplateUrl: { type: String },
    landscapeTemplateUrl: { type: String },
  },
  { timestamps: true }
);

export const Service = mongoose.model('Service', serviceSchema);
