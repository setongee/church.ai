import mongoose from 'mongoose';

// A presenter's work, sent for review. Everything a non-admin changes in Present stays on their own device until
// they send it here; an admin then accepts it (the changes are applied to the live data, in order) or sends it back.
// `ops` are the recorded changes: { method, area, id?, tempId?, label?, body? }. Pictures/videos made on the device
// travel as `files` and are matched to an op by its tempId.
const opSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ['POST', 'PUT', 'DELETE'], required: true },
    area: { type: String, required: true }, // which kind of thing (songs, schedules, media, …)
    id: { type: String, default: '' }, // the live (or device-made) id the op targets
    tempId: { type: String, default: '' }, // a device-made id given to something created in this submission
    label: { type: String, default: '' }, // a readable name for the reviewer
    body: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    note: { type: String, default: '', maxlength: 2000 },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'withdrawn'], default: 'pending', index: true },
    ops: { type: [opSchema], default: [] },
    files: { type: [{ tempId: String, path: String, name: String, mime: String, size: Number, type: { type: String } }], default: [], _id: false },
    // Approval progress, so an approval that stopped half-way carries on from where it did rather than starting again.
    applied: { type: Number, default: 0 },
    idMap: { type: mongoose.Schema.Types.Mixed, default: {} },
    urlMap: { type: mongoose.Schema.Types.Mixed, default: {} },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNote: { type: String, default: '', maxlength: 2000 },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);

export const Submission = mongoose.model('Submission', submissionSchema);
