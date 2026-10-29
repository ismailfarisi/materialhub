import { Elysia } from "elysia";

export const healthRoutes = new Elysia().get("/health", () => ({
  status: "ok",
  service: "integration-service",
  timestamp: new Date().toISOString(),
}));
