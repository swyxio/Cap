import { setTimeout as delay } from "node:timers/promises";
import { setupInstanceOrganizations } from "@cap/database/instance-setup";
import { migrateDb } from "@cap/database/migrate";
import { buildEnv } from "@cap/env";
import { setupInstanceLogos } from "./lib/instance-logos";

export async function register() {
	if (
		process.env.NEXT_PHASE === "phase-production-build" ||
		buildEnv.NEXT_PUBLIC_IS_CAP === "true"
	) {
		return;
	}

	if (buildEnv.NEXT_PUBLIC_DOCKER_BUILD === "true") {
		for (let attempt = 1; ; attempt++) {
			try {
				await migrateDb();
				console.log("Cap database migrations completed");
				break;
			} catch (error) {
				console.error(
					`Cap database migration attempt ${attempt} failed`,
					error,
				);
				if (attempt >= 3) throw error;
				await delay(5000);
			}
		}
	}

	await setupInstanceLogos();
	await setupInstanceOrganizations();

	if (process.env.WORKFLOW_TARGET_WORLD === "@fantasticfour/world-mysql") {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL is required for MySQL workflows");
		}

		const [{ createWorld }, { setWorld }] = await Promise.all([
			import("@fantasticfour/world-mysql"),
			import("workflow/runtime"),
		]);
		const world = createWorld({
			databaseUrl: process.env.DATABASE_URL,
			connectionLimit: 9,
			queue: {
				baseUrl: process.env.WORKFLOW_LOCAL_BASE_URL ?? "http://127.0.0.1:3000",
				concurrency: 2,
				pollIntervalMs: 250,
			},
		});
		setWorld(world);
		await world.start();
		process.once("SIGTERM", () => world.stop());
		process.once("SIGINT", () => world.stop());
		console.log("Cap MySQL workflow worker started");
	}
}
