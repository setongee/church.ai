import mongoose from 'mongoose';

const transcriptSegmentSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    text: { type: String, required: true },
    isFinal: { type: Boolean, default: true },
    startMs: { type: Number },
    endMs: { type: Number },
  },
  { timestamps: true }
);

export const TranscriptSegment = mongoose.model('TranscriptSegment', transcriptSegmentSchema);
