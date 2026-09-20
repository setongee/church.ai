import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
    title: { type: String, required: true, trim: true },
    preacher: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['live', 'ended'],
      default: 'live',
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    audioUrl: { type: String },
    summary: {
      type: new mongoose.Schema(
        {
          overview: String,
          topics: [String],
          keyPoints: [String],
          scriptures: [String],
          declarations: [String],
        },
        { _id: false }
      ),
      default: undefined,
    },
    carousel: {
      type: [
        new mongoose.Schema(
          {
            title: String,
            body: String,
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
  },
  { timestamps: true }
);

export const Session = mongoose.model('Session', sessionSchema);
