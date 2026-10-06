import { createRequire } from "node:module";

/**
 * Express 4 compatibility bridge.
 *
 * Express 4 does not forward rejected promises returned by async handlers to
 * the error middleware. WWHSS intentionally remains on Express 4.x for
 * compatibility with its current middleware/router surface, so we patch the
 * single Express Layer dispatch seam once instead of duplicating wrappers in
 * every route. This is a no-op when the bridge has already been installed.
 */
interface LayerPrototype {
  handle_request: (req: unknown, res: unknown, next: (error?: unknown) => void) => void;
  handle_error: (error: unknown, req: unknown, res: unknown, next: (error?: unknown) => void) => void;
}

interface LayerConstructor {
  prototype: LayerPrototype & Record<PropertyKey, unknown>;
}

const PATCH_MARK = Symbol.for("wwhs.express.async-errors.patched");
const require = createRequire(import.meta.url);
const Layer = require("express/lib/router/layer") as LayerConstructor;

if (!Layer.prototype[PATCH_MARK]) {
  const originalHandleRequest = Layer.prototype.handle_request;
  const originalHandleError = Layer.prototype.handle_error;

  Layer.prototype.handle_request = function handleRequest(req, res, next) {
    const fn = (this as unknown as { handle: (...args: unknown[]) => unknown }).handle;
    if (fn.length > 3) return next();

    try {
      const returned = fn(req, res, next);
      if (returned && typeof (returned as PromiseLike<unknown>).then === "function") {
        Promise.resolve(returned).catch(next);
      }
    } catch (error) {
      next(error);
    }
  };

  Layer.prototype.handle_error = function handleError(error, req, res, next) {
    const fn = (this as unknown as { handle: (...args: unknown[]) => unknown }).handle;
    if (fn.length !== 4) return next(error);

    try {
      const returned = fn(error, req, res, next);
      if (returned && typeof (returned as PromiseLike<unknown>).then === "function") {
        Promise.resolve(returned).catch(next);
      }
    } catch (nextError) {
      next(nextError);
    }
  };

  Object.defineProperty(Layer.prototype, PATCH_MARK, { value: true, enumerable: false });

  void originalHandleRequest;
  void originalHandleError;
}
