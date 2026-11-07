import mongoose from 'mongoose';

// A content campaign: a theme or series that calendar posts belong to. Posts point at it by name (ContentItem.campaign),
// so renaming a campaign renames it on its posts, and deleting one leaves its posts in place, without a campaign.
const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    key: { type: String, required: true, unique: true }, // lower-case name: two campaigns can't differ only by case
    goal: { type: String, default: '', maxlength: 1500 }, // what it is for, in a few sentences
    startDate: { type: String, default: '' }, // YYYY-MM-DD, optional
    endDate: { type: String, default: '' },
    archived: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const Campaign = mongoose.model('Campaign', campaignSchema);
