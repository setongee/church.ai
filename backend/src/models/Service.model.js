import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // The day of the service (shown on the team's calendar). Optional.
    date: { type: Date, default: null },
    portraitTemplateUrl: { type: String },
    landscapeTemplateUrl: { type: String },
  },
  { timestamps: true }
);

export const Service = mongoose.model('Service', serviceSchema);
