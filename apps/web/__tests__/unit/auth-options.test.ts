import { authOptions } from "@cap/database/auth/auth-options";
import { isEmailAllowedForSignup } from "@cap/database/auth/domain-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
	APPLE_CLIENT_ID: "so.cap.auth",
	APPLE_CLIENT_SECRET: "apple-secret",
	CAP_ALLOWED_SIGNUP_DOMAINS: undefined,
	GOOGLE_CLIENT_ID: "google-client",
	GOOGLE_CLIENT_SECRET: "google-secret",
	NEXTAUTH_SECRET: "next-auth-secret",
	RESEND_API_KEY: undefined,
	WORKOS_API_KEY: "workos-secret",
	WORKOS_CLIENT_ID: "workos-client",
}));

vi.mock("@cap/env", () => ({
	serverEnv: () => env,
}));

describe("authOptions", () => {
	beforeEach(() => {
		env.APPLE_CLIENT_ID = "so.cap.auth";
		env.APPLE_CLIENT_SECRET = "apple-secret";
	});

	it("enables Apple when both OAuth credentials are configured", () => {
		const options = authOptions();
		const providers = options.providers.map((provider) => provider.id);

		expect(providers).toContain("apple");
		expect(options.cookies?.callbackUrl?.options.sameSite).toBe("none");
		expect(options.cookies?.pkceCodeVerifier?.options.sameSite).toBe("none");
	});

	it("does not expose a partially configured Apple provider", () => {
		env.APPLE_CLIENT_SECRET = "";

		const providers = authOptions().providers.map((provider) => provider.id);

		expect(providers).not.toContain("apple");
	});

	// Without an explicit maxAge next-auth falls back to 24 hours, which is far
	// too long for a 6-digit code and contradicts what the OTP email tells users.
	it("expires email verification codes after the advertised 10 minutes", () => {
		const email = authOptions().providers.find(
			(provider) => provider.id === "email",
		);

		expect(email).toBeDefined();
		expect((email as { options?: { maxAge?: number } }).options?.maxAge).toBe(
			10 * 60,
		);
	});
});

describe("signup allowlist", () => {
	const allowlist = "ai.engineer,smol.ai,shawnthe1@gmail.com";

	it.each([
		"someone@ai.engineer",
		"someone@smol.ai",
		"shawnthe1@gmail.com",
		"SHAWNTHE1@GMAIL.COM",
	])("allows the configured domain or exact address: %s", (email) => {
		expect(isEmailAllowedForSignup(email, allowlist)).toBe(true);
	});

	it.each([
		"someone@gmail.com",
		"shawnthe1+test@gmail.com",
		"shawn.the1@gmail.com",
		"othershawnthe1@gmail.com",
		"shawnthe1@gmail.com.example.org",
		"someone@sub.ai.engineer",
		"someone@notai.engineer",
		"not-an-email",
	])("does not expand exact entries or accept malformed input: %s", (email) => {
		expect(isEmailAllowedForSignup(email, allowlist)).toBe(false);
	});

	it("normalizes allowlist case and surrounding whitespace", () => {
		expect(
			isEmailAllowedForSignup(
				"shawnthe1@gmail.com",
				" AI.ENGINEER, SMOL.AI, SHAWNTHE1@GMAIL.COM , ",
			),
		).toBe(true);
	});

	it("supports an exact-email-only allowlist", () => {
		expect(
			isEmailAllowedForSignup("shawnthe1@gmail.com", "shawnthe1@gmail.com"),
		).toBe(true);
		expect(
			isEmailAllowedForSignup("someone@gmail.com", "shawnthe1@gmail.com"),
		).toBe(false);
	});

	it("fails closed for a configured list with no matching valid entries", () => {
		expect(
			isEmailAllowedForSignup("shawnthe1@gmail.com", "invalid, @gmail.com, ,"),
		).toBe(false);
	});

	it.each([undefined, "", "   "])(
		"keeps unrestricted signup when no allowlist is configured: %s",
		(config) => {
			expect(isEmailAllowedForSignup("someone@example.org", config)).toBe(true);
		},
	);
});
