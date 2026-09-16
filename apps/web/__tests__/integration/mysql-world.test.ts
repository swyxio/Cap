import { createWorld } from "@fantasticfour/world-mysql";
import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.CAP_MYSQL_WORLD_TEST_URL)(
	"MySQL World wait durability",
	() => {
		it("atomically rejects concurrent and repeated completion of a durable wait", async () => {
			const world = createWorld({
				databaseUrl: process.env.CAP_MYSQL_WORLD_TEST_URL ?? "",
			});
			let runId: string | undefined;
			try {
				const result = await world.events.create(null, {
					eventType: "run_created",
					specVersion: world.specVersion,
					eventData: {
						deploymentId: "mysql-verification",
						workflowName: "cap-mysql-wait-verification",
						input: new Uint8Array(),
					},
				});
				runId = result.run?.runId;
				if (!runId) throw new Error("Verification run was not created");
				await world.events.create(runId, { eventType: "run_started" });
				await world.events.create(runId, {
					eventType: "wait_created",
					correlationId: "wait_cap_mysql_verification",
					eventData: { resumeAt: new Date() },
				});
				const complete = () =>
					world.events.create(runId ?? "", {
						eventType: "wait_completed",
						correlationId: "wait_cap_mysql_verification",
					});
				const completions = await Promise.allSettled(
					Array.from({ length: 8 }, complete),
				);
				expect(
					completions.filter((r) => r.status === "fulfilled"),
				).toHaveLength(1);
				for (const result of completions) {
					if (result.status === "rejected") {
						expect(result.reason).toMatchObject({
							name: "EntityConflictError",
						});
					}
				}
				await expect(complete()).rejects.toMatchObject({
					name: "EntityConflictError",
				});
				const events = await world.events.list({ runId });
				expect(
					events.data.filter((e) => e.eventType === "wait_completed"),
				).toHaveLength(1);
			} finally {
				if (runId) {
					await world.events.create(runId, { eventType: "run_cancelled" });
				}
				await world.close();
			}
		});
	},
);
