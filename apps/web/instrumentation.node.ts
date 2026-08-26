import { setTimeout as delay } from "node:timers/promises";
import { setupInstanceOrganizations } from "@cap/database/instance-setup";
import { migrateDb } from "@cap/database/migrate";
import { buildEnv } from "@cap/env";

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

	await setupInstanceOrganizations();

	if (process.env.WORKFLOW_TARGET_WORLD === "@workflow/world-postgres") {
		if (!process.env.WORKFLOW_POSTGRES_URL) {
			throw new Error(
				"WORKFLOW_POSTGRES_URL is required for Postgres workflows",
			);
		}

		const [{ createWorld }, { setWorld }] = await Promise.all([
			import("@workflow/world-postgres"),
			import("workflow/runtime"),
		]);
		const world = createWorld();
		setWorld(world);
		await world.start();
		console.log("Cap Postgres workflow worker started");
	}
}
