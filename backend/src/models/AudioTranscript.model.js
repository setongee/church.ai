import mongoose from 'mongoose';

// Word-level transcript of a session's final merged audio. Separate from TranscriptSegment
// (the live, chunked transcript) because live timestamps restart at 0 on every pause/resume and
// so can't be mapped onto the merged mp3 - these are timed against the mp3 itself.
const wordSchema = new mongoose.Schema({ w: String, s: Number, e: Number }, { _id: false });
const sectionSchema = new mongoose.Schema({ title: String, summary: String, s: Number, e: Number }, { _id: true });
const utteranceSchema = new mongoose.Schema({ text: String, s: Number, e: Number }, { _id: false });

const topicSchema = new mongoose.Schema({ label: String, prompt: String, kind: String }, { _id: false });

const audioTranscriptSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, unique: true },
    durationSec: { type: Number, default: 0 },
    words: { type: [wordSchema], default: [] },
    utterances: { type: [utteranceSchema], default: [] },
    // Parts of the service (worship, prayer, main message...), detected by the LLM and editable.
    sections: { type: [sectionSchema], default: [] },
    // Audio Lab: hot topics and moments the AI spotted in the message, offered as one-click ideas.
    labTopics: { type: [topicSchema], default: [] },
  },
  { timestamps: true }
);

export const AudioTranscript = mongoose.model('AudioTranscript', audioTranscriptSchema);
