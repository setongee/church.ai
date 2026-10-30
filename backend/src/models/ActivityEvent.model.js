import mongoose from 'mongoose';

// One thing a team member did on the platform (made a carousel, edited a design, started presenting...). Shown
// on the live activity page to admins and service managers.
const activitySchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorName: { type: String, default: '' },
    kind: { type: String, default: 'content' }, // content | design | audio | present | service | team | publish
    text: { type: String, required: true },
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '' },
    href: { type: String, default: '' },
    // Repeated edits to the same thing in a short time are folded into one event with a count.
    collapseKey: { type: String, default: '' },
    count: { type: Number, default: 1 },
  },
  { timestamps: true }
);
activitySchema.index({ createdAt: -1 });

export const ActivityEvent = mongoose.model('ActivityEvent', activitySchema);
