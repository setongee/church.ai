import mongoose from 'mongoose';

// One item in the order of service. It keeps a snapshot of its slides, so a schedule still shows
// what was planned even if the song/announcement it came from is edited or deleted later.
const itemSchema = new mongoose.Schema({
  type: { type: String, enum: ['scripture', 'song', 'announcement', 'image', 'prayer', 'quote', 'media', 'slideshow', 'template'], required: true },
  // A slide show item: how it plays ({ seconds, loop }).
  show: { type: mongoose.Schema.Types.Mixed, default: undefined },
  // A template item's scene: { layer, style: { frame, frameBg, align, scale } }.
  scene: { type: mongoose.Schema.Types.Mixed, default: undefined },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  slides: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // The id of the session (a named group inside the schedule, e.g. "Praise") this item sits in; '' = not in one.
  session: { type: String, default: '' },
});

// A session is a sub-schedule: a named group of items inside a schedule.
const sessionSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true } });

// A named run-of-service. `settings` is the look of the screen while this schedule is active
// ({ background, style: { align, scale, font, weight } }).
const scheduleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    items: { type: [itemSchema], default: [] },
    sessions: { type: [sessionSchema], default: [] },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);

export const Schedule = mongoose.model('Schedule', scheduleSchema);
