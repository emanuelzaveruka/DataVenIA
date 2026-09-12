import { afterEach, describe, expect, it } from "vitest";
import { getRepository, resetRepositoryCache } from "../get-repository";

afterEach(() => {
  resetRepositoryCache();
});

describe("getRepository", () => {
  it("falls back to the in-memory repository with no Supabase configured (critério de aceite 16)", () => {
    expect(getRepository({} as NodeJS.ProcessEnv).name).toBe("in-memory");
  });

  it("reuses the same in-memory instance, otherwise each call would lose the previous writes", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(getRepository(env)).toBe(getRepository(env));
  });

  it("selects Supabase when both variables are present", () => {
    const env = {
      SUPABASE_URL: "https://projeto.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
    } as unknown as NodeJS.ProcessEnv;

    expect(getRepository(env).name).toBe("supabase");
  });

  it("refuses a half-configured environment instead of silently degrading to memory", () => {
    const onlyUrl = { SUPABASE_URL: "https://projeto.supabase.co" } as unknown as NodeJS.ProcessEnv;
    const onlyKey = { SUPABASE_SERVICE_ROLE_KEY: "key" } as unknown as NodeJS.ProcessEnv;

    expect(() => getRepository(onlyUrl)).toThrow(/SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY/);
    expect(() => getRepository(onlyKey)).toThrow(/SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY/);
  });
});
