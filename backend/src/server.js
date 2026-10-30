import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import { env } from "./config/env.js";
import { connectDb } from "./config/db.js";
import sessionRoutes from "./routes/session.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import quoteRoutes from "./routes/quote.routes.js";
import brandRoutes from "./routes/brand.routes.js";
import templateRoutes from "./routes/template.routes.js";
import designRoutes from "./routes/design.routes.js";
import carouselRoutes from "./routes/carousel.routes.js";
import editorRoutes from "./routes/editor.routes.js";
import reelRoutes from "./routes/reel.routes.js";
import audioLabRoutes from "./routes/audioLab.routes.js";
import presentRoutes from "./routes/present.routes.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import pushRoutes from "./routes/push.routes.js";
import boardRoutes from "./routes/board.routes.js";
import submissionRoutes from "./routes/submission.routes.js";
import { dashboard } from "./controllers/dashboard.controller.js";
import { asyncHandler } from "./utils/asyncHandler.js";
import contentRoutes from "./routes/content.routes.js";
import { registerCallHandlers } from "./sockets/callHandler.js";
import { registerListenHandlers } from "./sockets/listenHandler.js";
import activityRoutes from "./routes/activity.routes.js";
import postUploadRoutes from "./routes/postUpload.routes.js";
import { activityLogger } from "./middlewares/activityLogger.js";
import { requireAuth, requireRole, readAnyWriteRole, userForToken } from "./middlewares/auth.js";
import { effectiveRoles } from "./services/access.service.js";
import { setIo, userRoom, STAFF_ROOM, AUTHED_ROOM } from "./services/realtime.service.js";
import { startContentScheduler } from "./services/contentScheduler.service.js";
import { startReminders } from "./services/reminders.service.js";
import { endLegacySessions } from "./controllers/presentSession.controller.js";

import { failInterruptedMerges } from "./controllers/audioLab.controller.js";
import { recoverInterruptedReels } from "./services/reelRender.service.js";
import { registerStreamHandlers } from "./sockets/streamHandler.js";
import { registerPresentHandlers, isDeviceId } from "./sockets/presentHandler.js";
import { UPLOADS_DIR } from "./middlewares/upload.js";

// Next.js auto-increments its dev port when the default is taken, so pinning CORS to one
// exact origin causes constant mismatches in local dev. Allow any localhost/127.0.0.1 origin
// (any port) plus the explicitly configured FRONTEND_ORIGIN, which matters once this is deployed.
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsOriginCheck(origin, callback) {
  if (
    !origin ||
    LOCALHOST_ORIGIN_RE.test(origin) ||
    origin === env.frontendOrigin ||
    env.extraOrigins.includes(origin)
  ) {
    callback(null, true);
  } else {
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  }
}

const app = express();
// maxAge: the browser remembers the cross-origin permission check for 10 minutes instead of repeating it before every call.
app.use(cors({ origin: corsOriginCheck, maxAge: 600 }));
app.use(express.json({ limit: "30mb" }));
app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/health", (req, res) => res.json({ ok: true }));
// Everything under /api needs a signed-in user except the login routes.
app.use("/api/auth", authRoutes);
app.use("/api", requireAuth);
// What each person does is recorded for the live activity page.
app.use("/api", activityLogger);
app.use("/api/users", userRoutes);
// Team chat is for everyone signed in; the live activity feed is for admins and service managers.
app.use("/api/chat", chatRoutes);
// Everyone signed in has their own notifications.
app.use("/api/notifications", notificationRoutes);
app.use("/api/push", pushRoutes);
// The team task board: everyone signed in can see it; what each person may change is decided inside the router.
// Someone whose only job is Presenter can look at the tasks but not change them.
const viewOnlyPresenter = (req, res, next) => {
  if (req.method !== "GET" && !req.user?.isAdmin && req.roles?.length && req.roles.every((r) => r === "presenter")) return res.status(403).json({ error: "Presenters can view tasks but not change them.", code: "VIEW_ONLY" });
  next();
};
app.use("/api/board", viewOnlyPresenter, boardRoutes);
// Work made on a device, sent for an admin to review (and publish to the live data).
app.use("/api/submissions", submissionRoutes);
// The Dashboard's own summary (each person only gets what they may see).
app.get("/api/dashboard", asyncHandler(dashboard));
// The content calendar: everyone can read it; changes are for the content team (decided inside the router).
app.use("/api/content", contentRoutes);
app.use("/api/activity", requireRole("manager"), activityRoutes);

// What each roster job may use. Admins pass every gate.
//   Presenter -> Present   Audio -> Audio Lab   Design -> the Studio pages
//   Service Manager -> Services, Audio Lab and the Studio pages
const studio = requireRole("design", "manager", "social");
// Image Studio (quote graphics) is also open to Presenters.
const imageStudio = requireRole("design", "manager", "social", "presenter");
// Reading services / sessions / quotes is open to anyone with a role (the studios and Audio Lab pull content
// from them). Changing them is for the Service Manager and Design (quote images, reels), and admins; only
// admins create, edit or delete a service itself (see service.routes.js).
app.use("/api/sessions", readAnyWriteRole("manager", "design", "social"), sessionRoutes);
app.use("/api/services", readAnyWriteRole("manager"), serviceRoutes);
app.use("/api/quotes", readAnyWriteRole("manager", "design", "social"), quoteRoutes);
// The brand (logo, theme) is readable by everyone signed in.
app.use("/api/brand", (req, res, next) => (req.method === "GET" ? next() : readAnyWriteRole("design", "manager", "social")(req, res, next)), brandRoutes);
// Someone with only the Presenter job uses Image Studio on their own device (see lib/studioDraft.ts); the server refuses
// their direct writes, and AI picture generation (it saves to the shared gallery as soon as it is made).
const studioDraftOnly = (req, res, next) => {
  const content = req.roles?.some((r) => ["design", "manager", "social"].includes(r));
  if (req.method !== "GET" && !req.user?.isAdmin && !content) return res.status(403).json({ error: "Your changes stay on this device until you send them for review.", code: "DRAFT_ONLY" });
  next();
};
app.use("/api/templates", imageStudio, studioDraftOnly, templateRoutes);
app.use("/api/designs", imageStudio, studioDraftOnly, designRoutes);
app.use("/api/carousels", studio, carouselRoutes);
app.use("/api/editor", imageStudio, studioDraftOnly, editorRoutes);
// Analytics and Instagram reports: the people who manage services and publish content (and admins).
app.use("/api/post-uploads", studio, postUploadRoutes);
app.use("/api/analytics", requireRole("manager", "design", "social"), analyticsRoutes);
app.use("/api/audio-lab", requireRole("audio", "manager"), audioLabRoutes);
// Anyone who isn't an admin changes Present only on their own device (see lib/draft.ts on the frontend); the server
// refuses their direct writes so nothing reaches the live data until an admin approves a submission.
const LIVE_WRITES = /^\/(songs(?!\/find)|announcements|media|scene-templates|wrappers|scripture-box|prayers|slideshows|quotes|schedules|bibles(\/download|\/import|\/[^/]+$))/;
const draftOnly = (req, res, next) => {
  if (req.method === "POST" && req.path === "/songs/import" && req.query.preview === "1") return next(); // reads files, saves nothing
  if (req.method !== "GET" && !req.user?.isAdmin && LIVE_WRITES.test(req.path)) return res.status(403).json({ error: "Your changes stay on this device until you send them for review.", code: "DRAFT_ONLY" });
  next();
};
app.use("/api/present", requireRole("presenter"), draftOnly, presentRoutes);
app.use("/api", studio, reelRoutes);

// Last-resort error handler (body-parser errors, multer errors, anything next(err) gets).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 413 ? "That file is too large." : err.message || "Something went wrong." });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: corsOriginCheck },
  maxHttpBufferSize: 1e7,
});

setIo(io);

// Sockets carry the same token as the API. A connection without one can only watch the output screen
// (present:join); every control event is refused. Tokens are re-checked every minute, so signing out
// elsewhere (or going idle) cuts a live connection off.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || "";
    const user = await userForToken(token);
    socket.data.token = token;
    // The secret id this browser keeps: it is what ties a presenter to the one device running it (see presentHandler).
    socket.data.deviceId = isDeviceId(socket.handshake.auth?.deviceId) ? String(socket.handshake.auth.deviceId) : "";
    socket.data.authed = Boolean(user);
    socket.data.roles = user ? await effectiveRoles(user) : [];
    socket.data.admin = Boolean(user?.isAdmin);
    socket.data.checkedAt = Date.now();
    if (user) {
      socket.join(userRoom(user._id));
      socket.join(AUTHED_ROOM);
      socket.data.user = { _id: user._id, name: user.name };
      if (socket.data.admin || socket.data.roles.includes("manager")) socket.join(STAFF_ROOM);
    }
  } catch (err) {
    console.error("[socket] auth check failed", err);
    socket.data.authed = false;
  }
  next();
});
io.on("connection", (socket) => {
  socket.use(async ([event], next) => {
    if (event === "present:join" || event === "present:output") return next();
    if (!socket.data.authed) return next(new Error("unauthorized"));
    if (Date.now() - socket.data.checkedAt > 60_000) {
      socket.data.checkedAt = Date.now();
      const user = await userForToken(socket.data.token).catch(() => null);
      if (!user) {
        socket.disconnect(true);
        return next(new Error("unauthorized"));
      }
      socket.data.roles = await effectiveRoles(user);
    }
    // The screen controls are for the Presenter, live transcription for the Service Manager.
    const need = event.startsWith("present:") || event.startsWith("listen:") ? "presenter" : event.startsWith("stream:") ? "manager" : null;
    if (need && !socket.data.admin && !socket.data.roles.includes(need)) return next(new Error("forbidden"));
    next();
  });
});

registerStreamHandlers(io);
registerPresentHandlers(io);
registerCallHandlers(io);
registerListenHandlers(io);

async function start() {
  await connectDb();
  await recoverInterruptedReels();
  await failInterruptedMerges();
  startContentScheduler();
  startReminders();
  await endLegacySessions();
  httpServer.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error("[server] failed to start", err);
  process.exit(1);
});
