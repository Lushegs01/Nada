import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * Delivers a web-push notification to every device registered against an
     * identity. Decorated by `registerPushRoutes`; declared here so callers get
     * a real type instead of casting the instance to `any` at every call site.
     * Optional because the decorator only exists once push routes are
     * registered, which the socket layer must not assume.
     */
    sendPushNotification?: (pubkeyHash: string, payload: string) => Promise<void>;
  }
}
