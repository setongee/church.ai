import { recordActivity } from '../services/activity.service.js';

// Turns successful changes made through the API into readable activity events. Matching is by method + path, so
// the controllers stay untouched. `edit` rules collapse into one event while someone keeps working on the same item.
const t = (b) => String(b?.title || b?.name || b?.headline || '').trim().slice(0, 70);
const q = (s) => (s ? ` “${s}”` : '');
const id = (b, m) => String(b?._id || m[1] || '');

const RULES = [
  // Carousels
  ['POST', /^\/api\/carousels$/, (m, b) => ({ kind: 'content', text: `Created a carousel${q(t(b))}`, entityType: 'carousel', entityId: id(b, m), href: `/carousels/${id(b, m)}` })],
  ['PATCH', /^\/api\/carousels\/([^/]+)$/, (m, b) => ({ kind: 'content', text: `Edited a carousel${q(t(b))}`, entityType: 'carousel', entityId: m[1], href: `/carousels/${m[1]}`, collapse: true })],
  ['POST', /^\/api\/carousels\/([^/]+)\/(media|animation-slide)$/, (m) => ({ kind: 'content', text: 'Added a slide to a carousel', entityType: 'carousel', entityId: m[1], href: `/carousels/${m[1]}`, collapse: true })],
  ['POST', /^\/api\/carousels\/([^/]+)\/publish\/instagram$/, (m) => ({ kind: 'publish', text: 'Published a carousel to Instagram', entityType: 'carousel', entityId: m[1], href: `/carousels/${m[1]}` })],
  // Designs
  ['POST', /^\/api\/designs$/, (m, b) => ({ kind: 'design', text: `Created a design${q(t(b))}`, entityType: 'design', entityId: id(b, m), href: `/design/${id(b, m)}` })],
  ['PATCH', /^\/api\/designs\/([^/]+)$/, (m, b) => ({ kind: 'design', text: `Edited a design${q(t(b))}`, entityType: 'design', entityId: m[1], href: `/design/${m[1]}`, collapse: true })],
  ['POST', /^\/api\/designs\/([^/]+)\/export$/, (m) => ({ kind: 'design', text: 'Exported a design', entityType: 'design', entityId: m[1], href: `/design/${m[1]}` })],
  ['POST', /^\/api\/designs\/([^/]+)\/animate$/, (m) => ({ kind: 'design', text: 'Animated a design', entityType: 'design', entityId: m[1], href: `/design/${m[1]}` })],
  ['POST', /^\/api\/designs\/([^/]+)\/publish\/instagram$/, (m) => ({ kind: 'publish', text: 'Published a design to Instagram', entityType: 'design', entityId: m[1], href: `/design/${m[1]}` })],
  // Quote images
  ['POST', /^\/api\/quotes\/([^/]+)\/(custom-image|export)$/, (m) => ({ kind: 'design', text: 'Edited a quote image', entityType: 'quote', entityId: m[1], href: `/editor/${m[1]}`, collapse: true })],
  ['PATCH', /^\/api\/quotes\/([^/]+)\/caption$/, (m) => ({ kind: 'content', text: 'Edited a quote caption', entityType: 'quote', entityId: m[1], href: `/editor/${m[1]}`, collapse: true })],
  ['POST', /^\/api\/quotes\/([^/]+)\/publish\/instagram$/, (m) => ({ kind: 'publish', text: 'Published a quote to Instagram', entityType: 'quote', entityId: m[1], href: `/editor/${m[1]}` })],
  // Reels, merged reels, photo reels
  ['POST', /^\/api\/sessions\/([^/]+)\/reels\/(generate|render-all|full|apply-template)$/, (m) => ({ kind: 'content', text: m[2] === 'render-all' ? 'Started rendering all reels' : m[2] === 'full' ? 'Created a full-message reel' : 'Generated reels', entityType: 'session', entityId: m[1], href: `/sessions/${m[1]}` })],
  ['POST', /^\/api\/reels\/([^/]+)\/render$/, () => ({ kind: 'content', text: 'Started rendering a reel', entityType: 'reel' })],
  ['PATCH', /^\/api\/reels\/([^/]+)$/, () => ({ kind: 'content', text: 'Edited a reel', entityType: 'reel', collapse: true })],
  ['POST', /^\/api\/reels\/([^/]+)\/publish-instagram$/, () => ({ kind: 'publish', text: 'Published a reel to Instagram', entityType: 'reel' })],
  ['POST', /^\/api\/sessions\/([^/]+)\/compilations\/generate$/, (m) => ({ kind: 'content', text: 'Created a merged reel', entityType: 'session', entityId: m[1], href: `/sessions/${m[1]}` })],
  ['POST', /^\/api\/compilations\/([^/]+)\/(render|publish-instagram)$/, (m) => ({ kind: m[2] === 'render' ? 'content' : 'publish', text: m[2] === 'render' ? 'Started rendering a merged reel' : 'Published a merged reel to Instagram', entityType: 'compilation' })],
  ['POST', /^\/api\/photo-reels$/, (m, b) => ({ kind: 'content', text: `Created a photo reel${q(t(b))}`, entityType: 'photoReel' })],
  ['POST', /^\/api\/photo-reels\/([^/]+)\/(render|carousel\/render)$/, () => ({ kind: 'content', text: 'Started rendering a photo reel', entityType: 'photoReel' })],
  ['POST', /^\/api\/photo-reels\/([^/]+)\/publish-instagram$/, () => ({ kind: 'publish', text: 'Published a photo reel to Instagram', entityType: 'photoReel' })],
  // Sessions, audio, notes
  ['POST', /^\/api\/services\/([^/]+)\/sessions$/, (m, b) => ({ kind: 'service', text: `Started a session${q(t(b))}`, entityType: 'session', entityId: id(b, [null]), href: b?._id ? `/sessions/${b._id}` : `/services/${m[1]}` })],
  ['POST', /^\/api\/services\/([^/]+)\/import-audio$/, (m, b) => ({ kind: 'audio', text: `Imported a recording${q(t(b))}`, entityType: 'session', entityId: id(b, [null]), href: b?._id ? `/sessions/${b._id}` : `/services/${m[1]}` })],
  ['POST', /^\/api\/sessions\/([^/]+)\/end$/, (m) => ({ kind: 'service', text: 'Ended a session', entityType: 'session', entityId: m[1], href: `/sessions/${m[1]}` })],
  ['POST', /^\/api\/audio-lab\/sessions\/([^/]+)\/generate$/, (m) => ({ kind: 'audio', text: 'Made an Audio Lab merge', entityType: 'session', entityId: m[1], href: '/audio-lab' })],
  ['PATCH', /^\/api\/audio-lab\/([^/]+)$/, () => ({ kind: 'audio', text: 'Edited an Audio Lab merge', entityType: 'audioMerge', href: '/audio-lab', collapse: true })],
  ['POST', /^\/api\/sessions\/([^/]+)\/message-notes\/(generate|regenerate)$/, (m) => ({ kind: 'content', text: 'Generated message notes', entityType: 'session', entityId: m[1], href: `/sessions/${m[1]}` })],
  ['PUT', /^\/api\/sessions\/([^/]+)\/message-notes$/, (m) => ({ kind: 'content', text: 'Edited message notes', entityType: 'session', entityId: m[1], href: `/sessions/${m[1]}`, collapse: true })],
  // Presenting
  ['POST', /^\/api\/present\/session$/, (m, b) => ({ kind: 'present', text: `Started presenting${q(b?.session?.scheduleName)}` })],
  ['PUT', /^\/api\/present\/session$/, (m, b) => ({ kind: 'present', text: `Switched the schedule${q(b?.session?.scheduleName)}` })],
  ['DELETE', /^\/api\/present\/session$/, () => ({ kind: 'present', text: 'Ended the service' })],
  ['POST', /^\/api\/present\/schedules$/, (m, b) => ({ kind: 'present', text: `Created a schedule${q(t(b))}` })],
  ['PUT', /^\/api\/present\/schedules\/([^/]+)$/, (m, b) => ({ kind: 'present', text: `Edited the schedule${q(t(b))}`, entityType: 'schedule', entityId: m[1], collapse: true })],
  ['DELETE', /^\/api\/present\/schedules\/([^/]+)$/, () => ({ kind: 'present', text: 'Deleted a schedule' })],
  ['POST', /^\/api\/present\/(songs|announcements|prayers|quotes|slideshows)$/, (m, b) => ({ kind: 'present', text: `Added ${{ songs: 'a song', announcements: 'an announcement', prayers: 'a prayer', quotes: 'a quote', slideshows: 'a slide show' }[m[1]]}${q(t(b))}` })],
  ['PUT', /^\/api\/present\/(songs|announcements|prayers|quotes|slideshows)\/([^/]+)$/, (m, b) => ({ kind: 'present', text: `Edited ${{ songs: 'a song', announcements: 'an announcement', prayers: 'a prayer', quotes: 'a quote', slideshows: 'a slide show' }[m[1]]}${q(t(b))}`, collapse: true, entityType: m[1], entityId: m[2] })],
  ['POST', /^\/api\/present\/scene-templates$/, (m, b) => ({ kind: 'present', text: `Created a presentation template${q(t(b))}` })],
  ['POST', /^\/api\/present\/media$/, () => ({ kind: 'present', text: 'Uploaded presentation media' })],
  // Uploaded posts
  ['POST', /^\/api\/post-uploads$/, (m, b) => ({ kind: 'content', text: `Uploaded a ${b?.kind === 'image' ? 'picture' : 'video'} to post${q(t(b))}`, entityType: 'upload', entityId: id(b, [null]), href: '/upload-post' })],
  ['POST', /^\/api\/post-uploads\/([^/]+)\/publish$/, (m, b) => ({ kind: 'publish', text: `Published an uploaded ${b?.kind === 'image' ? 'picture' : 'video'} to Instagram${q(t(b))}`, entityType: 'upload', entityId: m[1], href: '/upload-post' })],
  // Team board
  ['POST', /^\/api\/board\/sprints$/, (m, b) => ({ kind: 'task', text: `Created the sprint${q(t(b))}`, entityType: 'sprint', entityId: id(b, [null]), href: '/board' })],
  ['PATCH', /^\/api\/board\/sprints\/([^/]+)$/, (m, b) => ({ kind: 'task', text: `Edited the sprint${q(t(b))}`, entityType: 'sprint', entityId: m[1], href: '/board', collapse: true })],
  ['POST', /^\/api\/board\/sprints\/([^/]+)\/complete$/, (m) => ({ kind: 'task', text: 'Completed a sprint', entityType: 'sprint', entityId: m[1], href: '/board' })],
  ['DELETE', /^\/api\/board\/sprints\/([^/]+)$/, () => ({ kind: 'task', text: 'Deleted a sprint' })],
  ['POST', /^\/api\/board\/tasks$/, (m, b) => ({ kind: 'task', text: `Created a task${q(t(b))}`, entityType: 'task', entityId: id(b, [null]), href: b?._id || b?.id ? `/board?task=${b._id || b.id}` : '/board' })],
  ['PATCH', /^\/api\/board\/tasks\/([^/]+)$/, (m, b) => ({ kind: 'task', text: `Updated a task${q(t(b))}`, entityType: 'task', entityId: m[1], href: `/board?task=${m[1]}`, collapse: true })],
  ['POST', /^\/api\/board\/tasks\/([^/]+)\/move$/, (m, b) => ({ kind: 'task', text: `Moved a task${q(t(b))} to ${{ todo: 'To do', in_progress: 'In progress', review: 'In review', done: 'Done' }[b?.status] || 'another column'}`, entityType: 'task', entityId: m[1], href: `/board?task=${m[1]}`, collapse: true })],
  ['POST', /^\/api\/board\/tasks\/([^/]+)\/comments$/, (m, b) => ({ kind: 'task', text: `Commented on a task${q(t(b))}`, entityType: 'task', entityId: m[1], href: `/board?task=${m[1]}`, collapse: true })],
  ['DELETE', /^\/api\/board\/tasks\/([^/]+)$/, () => ({ kind: 'task', text: 'Deleted a task' })],
  // Content calendar
  ['POST', /^\/api\/content$/, (m, b) => ({ kind: 'content', text: `Planned a post${q(t(b))}`, entityType: 'contentItem', entityId: id(b, [null]), href: b?._id || b?.id ? `/calendar?item=${b._id || b.id}` : '/calendar' })],
  ['PATCH', /^\/api\/content\/([^/]+)$/, (m, b) => ({ kind: 'content', text: `Edited a planned post${q(t(b))}`, entityType: 'contentItem', entityId: m[1], href: `/calendar?item=${m[1]}`, collapse: true })],
  ['POST', /^\/api\/content\/([^/]+)\/schedule$/, (m, b) => ({ kind: 'content', text: `Scheduled a post${q(t(b))}`, entityType: 'contentItem', entityId: m[1], href: `/calendar?item=${m[1]}` })],
  ['POST', /^\/api\/content\/([^/]+)\/unschedule$/, (m, b) => ({ kind: 'content', text: `Unscheduled a post${q(t(b))}`, entityType: 'contentItem', entityId: m[1], href: `/calendar?item=${m[1]}` })],
  ['POST', /^\/api\/content\/([^/]+)\/publish-now$/, (m, b) => ({ kind: 'publish', text: `Posted ${t(b) ? `“${t(b)}” ` : 'a planned post '}to Instagram`, entityType: 'contentItem', entityId: m[1], href: `/calendar?item=${m[1]}` })],
  ['DELETE', /^\/api\/content\/([^/]+)$/, () => ({ kind: 'content', text: 'Removed a planned post' })],
  // Services & team (admins)
  ['POST', /^\/api\/services$/, (m, b) => ({ kind: 'service', text: `Created the service${q(t(b))}`, entityType: 'service', entityId: id(b, [null]), href: b?._id ? `/services/${b._id}` : '' })],
  ['PATCH', /^\/api\/services\/([^/]+)$/, (m, b) => ({ kind: 'service', text: `Edited the service${q(t(b))}`, entityType: 'service', entityId: m[1], href: `/services/${m[1]}`, collapse: true })],
  ['PUT', /^\/api\/services\/([^/]+)\/roster$/, (m) => ({ kind: 'service', text: 'Updated the roster', entityType: 'service', entityId: m[1], href: `/services/${m[1]}`, collapse: true })],
  ['POST', /^\/api\/services\/([^/]+)\/roster\/notify$/, (m) => ({ kind: 'service', text: 'Notified the team of their roster', entityType: 'service', entityId: m[1], href: `/services/${m[1]}` })],
];

export function activityLogger(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  let body;
  const json = res.json.bind(res);
  res.json = (b) => {
    body = b;
    return json(b);
  };
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    const path = req.originalUrl.split('?')[0].replace(/\/$/, '');
    for (const [method, re, build] of RULES) {
      if (method !== req.method) continue;
      const m = re.exec(path);
      if (!m) continue;
      const ev = build(m, body ?? {}, req);
      if (!ev) return;
      void recordActivity({ user: req.user, ...ev, collapseKey: ev.collapse ? `${ev.text.replace(/“.*”/, '').trim()}|${ev.entityId || path}` : '' });
      return;
    }
  });
  next();
}
