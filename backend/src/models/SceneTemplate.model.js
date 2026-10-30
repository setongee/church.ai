import mongoose from 'mongoose';

// A template the team built themselves: a named scene - a background plus where scripture, songs and other
// text sit on top of it (the same frame idea as the Frame control). Applied to the screen from the Templates
// tab or a schedule item.
const sceneTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // 'prayer' templates are the looks prayers use (listed in the Prayers tab); everything else is a general template.
    kind: { type: String, enum: ['general', 'prayer'], default: 'general' },
    background: { type: mongoose.Schema.Types.Mixed, default: null }, // { type, value } or null (keep the screen's own)
    frame: { type: mongoose.Schema.Types.Mixed, default: null }, // { x, y, w, h } on the 1920x1080 screen, or null
    frameBg: { type: mongoose.Schema.Types.Mixed, default: null },
    // Looks of its own for each section ({ scripture?, song?, prayer? } each { frame, frameBg, align, scale, background? });
    // a section not listed uses the default look above. Prayer templates are single-look and don't use this.
    sections: { type: mongoose.Schema.Types.Mixed, default: null },
    align: { type: String, enum: ['left', 'center'], default: 'center' },
    scale: { type: Number, default: 1 },
  },
  { timestamps: true, minimize: false }
);

export const SceneTemplate = mongoose.model('SceneTemplate', sceneTemplateSchema);
