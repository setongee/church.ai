import { AudioTranscript } from '../models/AudioTranscript.model.js';
import { planCompilation, planReel, videoTiming } from './reelRender.service.js';

// Adds `plannedSec` - how long each video will actually run once its speed and pause-cutting
// settings are applied - to reels or merged videos of ONE session, so the UI can show real
// lengths before anything is rendered.
export async function attachPlanned(items, kind) {
  const list = Array.isArray(items) ? items : [items];
  if (list.length === 0) return Array.isArray(items) ? [] : null;
  const transcript = await AudioTranscript.findOne({ session: list[0].session });
  const out = list.map((item) => {
    const obj = item.toObject();
    if (transcript) {
      try {
        const plan = kind === 'reel' ? planReel(item, transcript, item.options) : planCompilation(item, transcript).plan;
        obj.plannedSec = plan.totalSec; // the speech
        obj.videoSec = videoTiming(plan, item.options).totalSec; // the whole video: speech, echo tail and closing card
      } catch {
        // a planning problem must never break listing
      }
    }
    return obj;
  });
  return Array.isArray(items) ? out : out[0];
}
