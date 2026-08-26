import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/(org)/login/page";
import SignupPage from "@/app/(org)/signup/page";
import { SwyxUsageNotice } from "@/app/(org)/swyx-auth-layout";

vi.mock("@cap/database/auth/session", () => ({
	getCurrentUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("@cap/env", () => ({
	serverEnv: () => ({ WEB_URL: "https://cap.swyx.io" }),
}));
vi.mock("@/app/(org)/login/form", () => ({
	LoginForm: () => createElement("form", { "aria-label": "Login" }),
}));
vi.mock("@/app/(org)/signup/form", () => ({
	SignupForm: () => createElement("form", { "aria-label": "Signup" }),
}));

describe("swyx collaboration landing", () => {
	it.each(["login", "signup"])(
		"explains operator access before the %s form and links official resources",
		async (route) => {
			const page =
				route === "login"
					? await LoginPage({ searchParams: Promise.resolve({}) })
					: await SignupPage();
			const html = renderToStaticMarkup(page);
			const disclosure = "swyx can access every recording uploaded here.";

			expect(html).toContain(disclosure);
			expect(html.indexOf(disclosure)).toBeLessThan(html.indexOf("<form"));
			expect(html).toContain("even when they are marked private");
			expect(html).toContain("not personal recordings");
			expect(html).toContain("Tested. Approved by swyx.");
			expect(html).toContain('href="https://cap.so/docs"');
			expect(html).toContain('href="https://cap.so/docs/self-hosting"');
			expect(html).toContain('href="https://cap.so/docs/sharing/share-a-cap"');
			expect(html).toContain('href="https://swyx.io/tools"');
			expect(html).not.toContain("owned by you");
		},
	);

	it("gives the same work-only and operator-access notice for either sign-in method", () => {
		const html = renderToStaticMarkup(createElement(SwyxUsageNotice));
		expect(html).toContain("By signing in");
		expect(html).toContain("only for work with swyx");
		expect(html).toContain("swyx can access every recording you upload here");
	});
});
