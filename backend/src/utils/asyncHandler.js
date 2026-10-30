// Express 4 doesn't catch rejected promises from async handlers; this turns a thrown error into
// a JSON `{ error }` response (using err.status when the error carries one) instead of hanging.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error(`[${req.method} ${req.originalUrl}]`, err);
      if (res.headersSent) return next(err);
      res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
    });
  };
}
