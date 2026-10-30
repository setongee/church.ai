import { purgeAnimations } from '../controllers/designAnimation.controller.js';
import fs from 'fs';
import path from 'path';
import { Service } from '../models/Service.model.js';
import { Session } from '../models/Session.model.js';
import { TranscriptSegment } from '../models/TranscriptSegment.model.js';
import { Quote } from '../models/Quote.model.js';
import { Insight } from '../models/Insight.model.js';
import { ChatMessage } from '../models/ChatMessage.model.js';
import { Design } from '../models/Design.model.js';
import { MessageNotes } from '../models/MessageNotes.model.js';
import { Carousel } from '../models/Carousel.model.js';
import { CAROUSEL_DIR } from '../controllers/carousel.controller.js';
import { Reel } from '../models/Reel.model.js';
import { Compilation } from '../models/Compilation.model.js';
import { AudioMerge } from '../models/AudioMerge.model.js';
import { AudioTranscript } from '../models/AudioTranscript.model.js';
import { stopAnalysis } from './analysis.service.js';
import { AUDIO_DIR, CLIPS_DIR, REELS_DIR } from './audioPipeline.service.js';

// Removes the files that belong to specific record ids - never "everything in a folder".
async function removeFilesFor(dir, ids) {
  let names;
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return;
  }
  const mine = names.filter((n) => ids.some((id) => n.startsWith(String(id))));
  await Promise.all(mine.map((n) => fs.promises.unlink(path.join(dir, n)).catch(() => {})));
}

// A session and everything made from it: transcript, quotes, designs, reels, merged videos,
// the stored recording and the rendered files.
export async function deleteSessionCascade(sessionId) {
  const session = await Session.findById(sessionId);
  if (!session) return false;
  try {
    stopAnalysis(String(sessionId));
  } catch {
    // not being analysed
  }
  const [reels, comps] = await Promise.all([Reel.find({ session: sessionId }, '_id'), Compilation.find({ session: sessionId }, '_id')]);
  const merges = await AudioMerge.find({ session: sessionId }, '_id');
  const ids = [...reels, ...comps].map((d) => d._id);
  const designIds = (await Design.find({ session: sessionId }, '_id')).map((d) => d._id);
  await purgeAnimations(designIds);
  const carouselIds = (await Carousel.find({ session: sessionId }, '_id')).map((d) => d._id);
  await Promise.all([
    Carousel.deleteMany({ session: sessionId }),
    MessageNotes.deleteMany({ session: sessionId }),
    TranscriptSegment.deleteMany({ session: sessionId }),
    Quote.deleteMany({ session: sessionId }),
    Insight.deleteMany({ session: sessionId }),
    ChatMessage.deleteMany({ session: sessionId }),
    Design.deleteMany({ session: sessionId }),
    Reel.deleteMany({ session: sessionId }),
    Compilation.deleteMany({ session: sessionId }),
    AudioMerge.deleteMany({ session: sessionId }),
    AudioTranscript.deleteMany({ session: sessionId }),
  ]);
  await Promise.all([removeFilesFor(CLIPS_DIR, [...ids, ...merges.map((m) => m._id)]), removeFilesFor(REELS_DIR, ids), removeFilesFor(AUDIO_DIR, [sessionId]), removeFilesFor(CAROUSEL_DIR, carouselIds)]);
  await session.deleteOne();
  return true;
}

export async function deleteServiceCascade(serviceId) {
  const service = await Service.findById(serviceId);
  if (!service) return null;
  const sessions = await Session.find({ service: serviceId }, '_id');
  for (const s of sessions) await deleteSessionCascade(s._id);
  await service.deleteOne();
  return { sessions: sessions.length };
}
