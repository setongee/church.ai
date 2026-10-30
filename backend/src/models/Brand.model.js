import mongoose from 'mongoose';

// One brand profile for the whole app (there is no multi-tenant account model yet): the church's
// logo, pastor, socials and address, so editor templates can use them without re-uploading.
const brandSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    // Built-in Image Studio templates the user deleted (hidden from the picker; restorable).
    hiddenTemplates: { type: [String], default: [] },
    churchName: { type: String, default: '' },
    tagline: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    // Optional light/white version of the logo, used on dark backgrounds.
    logoLightUrl: { type: String, default: '' },
    pastorName: { type: String, default: '' },
    pastorTitle: { type: String, default: '' },
    pastorImageUrl: { type: String, default: '' },
    // Other ministers / guest preachers. A session's preacher name is matched against these (and
    // the pastor above) to find the photo a template's "preacher photo" slot should show.
    ministers: {
      type: [new mongoose.Schema({ name: { type: String, required: true, trim: true }, title: { type: String, default: '' }, imageUrl: { type: String, default: '' } })],
      default: [],
    },
    address: { type: String, default: '' },
    // Shown in the closing card of every video: one line per service, e.g. "Sundays 9am & 11am".
    serviceTimes: { type: String, default: '' },
    // Big line on the closing card, e.g. "Get the full message".
    outroCta: { type: String, default: 'Get the full message' },
    website: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    // Giving / offering details used by the Offering template.
    bankName: { type: String, default: '' },
    accountName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    socials: {
      instagram: { type: String, default: '' },
      facebook: { type: String, default: '' },
      youtube: { type: String, default: '' },
      x: { type: String, default: '' },
      tiktok: { type: String, default: '' },
    },
    primaryColor: { type: String, default: '' },
    accentColor: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Brand = mongoose.model('Brand', brandSchema);
