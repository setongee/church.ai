import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    portraitTemplateUrl: { type: String },
    landscapeTemplateUrl: { type: String },
  },
  { timestamps: true }
);

export const Service = mongoose.model('Service', serviceSchema);
