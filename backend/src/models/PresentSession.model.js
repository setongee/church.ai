import mongoose from 'mongoose';

// One run of the Present screen: started by picking (or creating) a schedule, finished with "End
// Service". At most one is active at a time; the finished ones tell us when each schedule was last used.
const presentSessionSchema = new mongoose.Schema(
  {
    schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule', required: true, index: true },
    scheduleName: { type: String, default: '' },
    // The device (a one-way hash of its secret id) running this service, and who started it: a service belongs to
    // the device that started it and can't be seen, switched or ended from any other.
    device: { type: String, default: '', index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export const PresentSession = mongoose.model('PresentSession', presentSessionSchema);
