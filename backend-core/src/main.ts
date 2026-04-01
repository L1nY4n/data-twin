import "reflect-metadata";

import { createApp } from "./create-app";

async function bootstrap() {
  const app = await createApp();
  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number.parseInt(process.env.PORT ?? "4000", 10);

  await app.listen({ host, port });

  console.log(`backend-core listening on ${await app.getUrl()}`);
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
