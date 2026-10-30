import mongoose from 'mongoose';

// A template the user edited and saved. `baseId` set = an override of a built-in template (used
// instead of the generated layout from then on); unset = a user-created template.
const savedTemplateSchema = new mongoose.Schema(
  {
    baseId: { type: String, index: true },
    name: { type: String, default: 'My template' },
    kind: { type: String, enum: ['quote', 'excerpt', 'title', 'give'], default: 'quote' },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    // Serialized editor canvas. Text layers carry a `slot` so new content can be poured in.
    editorState: { type: mongoose.Schema.Types.Mixed, required: true },
    // Small JPEG data URL for the picker.
    thumb: { type: String, default: '' },
    // The same template hand-tuned for other canvas sizes. width/height/editorState above is the
    // primary; applying picks the exact size if one exists, else the closest shape and rescales.
    variants: {
      type: [
        new mongoose.Schema(
          {
            width: { type: Number, required: true },
            height: { type: Number, required: true },
            editorState: { type: mongoose.Schema.Types.Mixed, required: true },
            thumb: { type: String, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const SavedTemplate = mongoose.model('SavedTemplate', savedTemplateSchema);
