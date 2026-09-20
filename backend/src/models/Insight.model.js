import mongoose from 'mongoose';

const insightSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    type: {
      type: String,
      enum: ['keyPoint', 'topic', 'scripture', 'declaration'],
      required: true,
    },
    text: { type: String, required: true },
    reference: { type: String },
    // Only set for a keyPoint that's a detected enumerated list (e.g. "three ways to walk in
    // blessing: first... second... third..."). `text` is the list's overall title/theme in that
    // case, and `groupId` lets later transcript windows append more items to the same list
    // instead of creating a separate insight per window.
    items: { type: [String], default: undefined },
    groupId: { type: String },
  },
  { timestamps: true }
);

export const Insight = mongoose.model('Insight', insightSchema);
