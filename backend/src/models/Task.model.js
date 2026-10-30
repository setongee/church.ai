import mongoose from 'mongoose';

const checklistItem = new mongoose.Schema({ text: { type: String, required: true, maxlength: 200 }, done: { type: Boolean, default: false } }, { _id: true });
const comment = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, text: { type: String, required: true, maxlength: 2000 }, at: { type: Date, default: Date.now } }, { _id: true });
// A readable trail of what happened to the task (who moved it, who it was given to, ...), so the admin can follow progress.
const entry = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['created', 'moved', 'assigned', 'unassigned', 'edited', 'comment', 'checklist'], required: true },
    from: { type: String, default: '' },
    to: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// One piece of work on the board. Admins create and assign tasks; the people it's assigned to move it along and update it.
const taskSchema = new mongoose.Schema(
  {
    sprint: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 4000 },
    status: { type: String, enum: ['todo', 'in_progress', 'review', 'done'], default: 'todo', index: true },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    assignees: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    dueDate: { type: Date, default: null },
    labels: { type: [String], default: [] },
    checklist: { type: [checklistItem], default: [] },
    comments: { type: [comment], default: [] },
    history: { type: [entry], default: [] },
    order: { type: Number, default: 0 }, // position within its column
    // The content-calendar item this task is the work for (and the item points back at the task).
    contentItem: { type: mongoose.Schema.Types.ObjectId, ref: 'ContentItem', default: null },
    // Due-date reminders already sent for the current due date (resets by itself when the date changes).
    reminders: { due: { type: String, default: '' }, sent: { type: [String], default: [] } },
    completedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
taskSchema.index({ sprint: 1, status: 1, order: 1 });

export const Task = mongoose.model('Task', taskSchema);
