import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import { env } from "./config/env.js";
import { connectDb } from "./config/db.js";
import sessionRoutes from "./routes/session.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import quoteRoutes from "./routes/quote.routes.js";
import { registerStreamHandlers } from "./sockets/streamHandler.js";
import { UPLOADS_DIR } from "./middlewares/upload.js";

// Next.js auto-increments its dev port when the default is taken, so pinning CORS to one
// exact origin causes constant mismatches in local dev. Allow any localhost/127.0.0.1 origin
// (any port) plus the explicitly configured FRONTEND_ORIGIN, which matters once this is deployed.
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsOriginCheck(origin, callback) {
  if (
    !origin ||
    LOCALHOST_ORIGIN_RE.test(origin) ||
    origin === env.frontendOrigin
  ) {
    callback(null, true);
  } else {
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  }
}

const app = express();
app.use(cors({ origin: corsOriginCheck }));
app.use(express.json({ limit: "15mb" }));
app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/sessions", sessionRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/quotes", quoteRoutes);

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: corsOriginCheck },
  maxHttpBufferSize: 1e7,
});

registerStreamHandlers(io);

async function start() {
  await connectDb();
  httpServer.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error("[server] failed to start", err);
  process.exit(1);
});
