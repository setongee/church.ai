import { Session } from '../models/Session.model.js';
import { TranscriptSegment } from '../models/TranscriptSegment.model.js';
import { Quote } from '../models/Quote.model.js';
import { Insight } from '../models/Insight.model.js';
import { ChatMessage } from '../models/ChatMessage.model.js';
import { generateSummary, generateCarousel, answerSessionQuestion } from '../services/openrouter.service.js';
import { getAnalysis, stopAnalysis } from '../services/analysis.service.js';

export async function createSessionForService(req, res) {
  const { id: serviceId } = req.params;
  const { title, preacher } = req.body;
  if (!title?.trim() || !preacher?.trim()) {
    return res.status(400).json({ error: 'title and preacher are required' });
  }

  const session = await Session.create({ service: serviceId, title: title.trim(), preacher: preacher.trim() });
  res.status(201).json(session);
}

export async function listSessionsForService(req, res) {
  const { id: serviceId } = req.params;
  const sessions = await Session.find({ service: serviceId }).sort({ createdAt: -1 }).limit(200);
  res.json(sessions);
}

export async function getSession(req, res) {
  const { id } = req.params;
  const [session, transcript, quotes, insights, chatMessages] = await Promise.all([
    Session.findById(id).populate('service'),
    TranscriptSegment.find({ session: id }).sort({ createdAt: 1 }),
    Quote.find({ session: id }).sort({ createdAt: 1 }),
    Insight.find({ session: id }).sort({ createdAt: 1 }),
    ChatMessage.find({ session: id }).sort({ createdAt: 1 }),
  ]);

  if (!session) return res.status(404).json({ error: 'session not found' });

  res.json({ session, transcript, quotes, insights, chatMessages });
}

export async function endSession(req, res) {
  const { id } = req.params;
  const session = await Session.findById(id);
  if (!session) return res.status(404).json({ error: 'session not found' });

  const analysis = getAnalysis(id);
  const fullTranscript =
    analysis?.getFullTranscript() ||
    (await TranscriptSegment.find({ session: id }).sort({ createdAt: 1 }))
      .map((s) => s.text)
      .join(' ');

  session.status = 'ended';
  session.endedAt = new Date();

  if (fullTranscript.trim().length > 0) {
    const summary = await generateSummary({ fullText: fullTranscript });
    if (summary) {
      session.summary = summary;
      const carousel = await generateCarousel({ summary });
      if (carousel?.length) session.carousel = carousel;
    }
  }

  await session.save();
  stopAnalysis(id);

  res.json(session);
}

// The Instagram review page only cares about quotes that have gone through the image editor
// and been exported - anything still text-only isn't a postable image yet.
export async function getPublishQueue(req, res) {
  const { id } = req.params;
  const session = await Session.findById(id).populate('service');
  if (!session) return res.status(404).json({ error: 'session not found' });

  const quotes = await Quote.find({ session: id, exportedImageUrl: { $exists: true, $ne: null } }).sort({
    createdAt: 1,
  });
  res.json({ session, quotes });
}

export async function postChatMessage(req, res) {
  const { id } = req.params;
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  const session = await Session.findById(id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (session.status !== 'ended') {
    return res.status(400).json({ error: 'Chat is only available after the session has ended.' });
  }

  const userMessage = await ChatMessage.create({ session: id, role: 'user', text: text.trim() });

  const [fullTranscript, priorMessages] = await Promise.all([
    TranscriptSegment.find({ session: id }).sort({ createdAt: 1 }),
    ChatMessage.find({ session: id }).sort({ createdAt: 1 }),
  ]);

  const answer = await answerSessionQuestion({
    fullText: fullTranscript.map((s) => s.text).join(' '),
    summary: session.summary,
    history: priorMessages.map((m) => ({ role: m.role, text: m.text })),
    question: text.trim(),
  });

  const assistantMessage = await ChatMessage.create({
    session: id,
    role: 'assistant',
    text: answer || "Sorry, I couldn't come up with an answer for that.",
  });

  res.status(201).json({ userMessage, assistantMessage });
}
