import "reflect-metadata";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../src/create-app";

type TestApp = {
  app: NestFastifyApplication;
  server: ReturnType<NestFastifyApplication["getHttpServer"]>;
  baseUrl: string;
  close: () => Promise<void>;
};

export async function createTestApp(): Promise<TestApp> {
  const app = await createApp();
  await app.listen({ host: "127.0.0.1", port: 0 });
  const server = app.getHttpServer();
  const baseUrl = await app.getUrl();

  return {
    app,
    server,
    baseUrl,
    close: () => app.close(),
  };
}
