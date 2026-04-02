import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createTestApp } from "./create-test-app";

type TestResponse = {
  status: number;
  body: unknown;
};

type TestRequest = {
  get: (path: string) => Promise<TestResponse>;
};

const request = require("supertest") as (server: unknown) => TestRequest;

let testApp: Awaited<ReturnType<typeof createTestApp>>;

describe("health endpoints", () => {
  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  test("GET /health/live returns ok status", async () => {
    const response = await request(testApp.server).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  test("GET /health/ready returns ready status", async () => {
    const response = await request(testApp.server).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ready" });
  });
});
