import { User } from "@cap/web-domain";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareableLinkUsage } from "@/app/(org)/dashboard/DashboardContext";
import { UsageButton } from "@/components/UsageButton";
import { getDashboardShareableLinkUsage } from "@/lib/shareable-link-quota";

const state = vi.hoisted(() => ({
	limit: 25,
	whitelisted: false,
	pro: true,
	usage: null as ShareableLinkUsage | null,
	collapsed: false,
	where: vi.fn(),
	select: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@cap/database", () => ({
	db: () => ({ select: state.select }),
}));
vi.mock("@cap/database/instance-policy", () => ({
	getPublicVideoLimit: () => state.limit,
	isInstanceWhitelisted: () => state.whitelisted,
}));
vi.mock("@cap/utils", () => ({ userIsPro: () => state.pro }));
vi.mock("@/app/(org)/dashboard/Contexts", () => ({
	useDashboardContext: () => ({
		sidebarCollapsed: state.collapsed,
		shareableLinkUsage: state.usage,
		setUpgradeModalOpen: vi.fn(),
	}),
}));
vi.mock("@cap/ui", () => ({
	Button: ({ children }: { children: ReactNode }) =>
		createElement("button", { type: "button" }, children),
	Popover: ({ children }: { children: ReactNode }) => children,
	PopoverTrigger: ({ children }: { children: ReactNode }) => children,
	PopoverContent: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/Tooltip", () => ({
	Tooltip: ({ children, content }: { children: ReactNode; content: string }) =>
		createElement("div", { "data-tooltip": content }, children),
}));
vi.mock("motion/react", () => ({
	motion: { div: () => createElement("div") },
}));

const user = { id: User.UserId.make("public-user"), email: "user@example.com" };
const renderUsage = (subscribed = true) =>
	renderToStaticMarkup(createElement(UsageButton, { subscribed }));

beforeEach(() => {
	state.limit = 25;
	state.whitelisted = false;
	state.pro = true;
	state.usage = null;
	state.collapsed = false;
	state.select.mockImplementation(() => ({
		from: () => ({ where: state.where }),
	}));
	state.where.mockResolvedValue([{ used: 25 }]);
});

describe("dashboard stored recording quota", () => {
	it("counts every stored row for capped users even when self-hosted Pro is enabled", async () => {
		expect(await getDashboardShareableLinkUsage(user)).toEqual({
			kind: "stored",
			used: 25,
			limit: 25,
		});
		const query = new MySqlDialect().sqlToQuery(
			state.where.mock.calls[0]?.[0] as SQL,
		);
		expect(query.params).toEqual([user.id]);
		expect(query.sql).toContain("ownerId");
		expect(query.sql).not.toContain("isScreenshot");
		expect(query.sql).not.toContain("createdAt");
	});

	it("keeps the cap visible as unavailable when counting fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		state.where.mockRejectedValueOnce(new Error("Database unavailable"));
		expect(await getDashboardShareableLinkUsage(user)).toEqual({
			kind: "stored",
			used: null,
			limit: 25,
		});
	});

	it("does not misrepresent an absent count row as zero usage", async () => {
		state.where.mockResolvedValueOnce([]);
		expect(await getDashboardShareableLinkUsage(user)).toEqual({
			kind: "stored",
			used: null,
			limit: 25,
		});
	});

	it("preserves unlimited behavior for whitelisted self-hosted users", async () => {
		state.whitelisted = true;
		expect(await getDashboardShareableLinkUsage(user)).toBeNull();
		expect(state.select).not.toHaveBeenCalled();
		expect(renderUsage()).toContain("Unlimited");
	});

	it("retains upstream monthly counting when the instance cap is disabled", async () => {
		state.limit = 0;
		state.pro = false;
		state.where.mockResolvedValueOnce([{ used: 4 }]);
		state.usage = await getDashboardShareableLinkUsage(user);
		expect(state.usage).toMatchObject({ used: 4 });
		const query = new MySqlDialect().sqlToQuery(
			state.where.mock.calls[0]?.[0] as SQL,
		);
		expect(query.sql).toContain("isScreenshot");
		expect(query.sql).toContain("createdAt");
		const html = renderUsage(false);
		expect(html).toContain("Upgrade to Pro");
		expect(html).toContain("Resets on the 1st");
	});

	it.each([0, 12, 25])(
		"renders %i stored recordings without a paid upgrade or unlimited claim",
		(used) => {
			state.usage = { kind: "stored", used, limit: 25 };
			const html = renderUsage();
			expect(html).toContain("Stored recordings");
			expect(html).toContain(`${used}/25`);
			expect(html).toContain("Recordings and screenshots count");
			expect(html).toContain("Delete one to free a slot");
			expect(html).toContain("ask swyx to whitelist your account");
			expect(html).not.toContain("Upgrade");
			expect(html).not.toContain("Unlimited");
			if (used === 25) expect(html).toContain("Limit reached");
		},
	);

	it("renders an unknown count honestly without hiding the limit", () => {
		state.usage = { kind: "stored", used: null, limit: 25 };
		const html = renderUsage();
		expect(html).toContain("Unavailable / 25");
		expect(html).toContain("Usage could not be loaded");
		expect(html).toContain("limit still applies");
		expect(html).not.toContain("0/25");
		expect(html).not.toContain("Unlimited");
	});

	it("shows the same capped usage and explanation in a collapsed sidebar", () => {
		state.usage = { kind: "stored", used: 25, limit: 25 };
		state.collapsed = true;
		const html = renderUsage();
		expect(html).toContain("Stored recordings: 25/25");
		expect(html).toContain("ask swyx to whitelist your account");
		expect(html).toContain('href="/dashboard/caps"');
		expect(html).not.toContain("Upgrade");
		expect(html).not.toContain("Unlimited");
	});
});
