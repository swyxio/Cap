import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../../proxy";

vi.mock("@cap/database", () => ({ db: vi.fn() }));
vi.mock("@cap/database/schema", () => ({ organizations: {} }));
vi.mock("@cap/env", () => ({
	buildEnv: { NEXT_PUBLIC_IS_CAP: "false" },
	serverEnv: () => ({ WEB_URL: "https://cap.swyx.io" }),
}));

afterEach(() => vi.unstubAllEnvs());

describe("self-hosted proxy routes", () => {
	it("allows browser-based CLI authorization pages", () => {
		const source = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
		expect(source).toContain('path.startsWith("/cli/")');
	});

	it("serves the Google sign-in icon instead of redirecting the image to login", async () => {
		vi.stubEnv("NODE_ENV", "production");
		const response = await proxy(
			new NextRequest("https://cap.swyx.io/google.svg"),
		);
		expect(response.headers.get("location")).toBeNull();
		expect(response.headers.get("x-middleware-next")).toBe("1");
	});

	it("does not widen the self-hosted route allowlist to other asset-like paths", async () => {
		vi.stubEnv("NODE_ENV", "production");
		const response = await proxy(
			new NextRequest("https://cap.swyx.io/google.svg/unrelated"),
		);
		expect(response.headers.get("location")).toBe("https://cap.swyx.io/login");
	});
});
