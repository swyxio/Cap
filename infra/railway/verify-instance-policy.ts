import assert from "node:assert/strict";

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	assert(databaseUrl, "DATABASE_URL is required");
	const databaseName = new URL(databaseUrl).pathname.slice(1);
	assert(
		/^cap_policy_verify_\d{8}$/.test(databaseName),
		"Refusing to run outside an isolated cap_policy_verify_YYYYMMDD database",
	);
	Object.assign(process.env, {
		WEB_URL: "https://cap-policy-verify.invalid",
		NEXT_PUBLIC_WEB_URL: "https://cap-policy-verify.invalid",
		NEXTAUTH_URL: "https://cap-policy-verify.invalid",
		NEXTAUTH_SECRET: "isolated-verification-not-a-production-secret",
		CAP_AWS_BUCKET: "isolated-verification-unused",
		CAP_AWS_REGION: "auto",
		CAP_ALLOWED_SIGNUP_DOMAINS:
			"ai.engineer,latent.space,smol.ai,swyx@cognition.ai,shawnthe1@gmail.com",
		CAP_PUBLIC_SIGNUP_LIMIT: "100",
		CAP_PUBLIC_VIDEO_LIMIT: "25",
		NODE_ENV: "test",
	});

	const [{ db }, { users, videos }, signup, videoLimits, { count, eq }] =
		await Promise.all([
			import("../../packages/database/index.ts"),
			import("../../packages/database/schema.ts"),
			import("../../packages/database/signup-limits.ts"),
			import("../../packages/database/video-limits.ts"),
			import("drizzle-orm"),
		]);
	const database = db();
	type UserId = typeof users.$inferInsert.id;
	type VideoId = typeof videos.$inferInsert.id;
	type OrgId = typeof videos.$inferInsert.orgId;
	const userId = (index: number) =>
		`verifyu${String(index).padStart(8, "0")}` as UserId;
	const videoId = (index: number) =>
		`verifyv${String(index).padStart(8, "0")}` as VideoId;
	const videoData = (index: number, ownerId: UserId) => ({
		id: videoId(index),
		ownerId,
		orgId: "verifyorg000001" as OrgId,
		name: "Disposable policy verification",
	});

	function barrier() {
		let arrivals = 0;
		let release = () => {};
		const ready = new Promise<void>((resolve) => {
			release = resolve;
		});
		return async () => {
			if (++arrivals === 2) release();
			await ready;
		};
	}

	try {
		const [initialUsers] = await database
			.select({ count: count() })
			.from(users);
		const [initialVideos] = await database
			.select({ count: count() })
			.from(videos);
		assert.equal(
			initialUsers?.count,
			0,
			"Verification database must have no users",
		);
		assert.equal(
			initialVideos?.count,
			0,
			"Verification database must have no videos",
		);
		await database.insert(users).values(
			Array.from({ length: 99 }, (_, index) => ({
				id: userId(index),
				email: `guest${index}@policy-verify.invalid`,
			})),
		);

		const signupBarrier = barrier();
		const signupResults = await Promise.allSettled(
			[100, 101].map((index) =>
				database.transaction(async (tx) => {
					await tx.select({ count: count() }).from(users);
					await signupBarrier();
					await signup.lockInstanceSignups(tx);
					const email = `guest${index}@policy-verify.invalid`;
					await signup.assertNewUserAllowed(tx, email);
					await tx.insert(users).values({ id: userId(index), email });
				}),
			),
		);
		assert.equal(
			signupResults.filter((result) => result.status === "fulfilled").length,
			1,
		);
		const rejectedSignup = signupResults.find(
			(result) => result.status === "rejected",
		);
		assert(
			rejectedSignup?.status === "rejected" &&
				rejectedSignup.reason instanceof signup.PublicSignupFullError,
		);
		assert.equal(
			(await database.select({ count: count() }).from(users))[0]?.count,
			100,
		);
		console.log(
			JSON.stringify({ check: "parallel_signup_99_to_100", passed: true }),
		);

		for (const [index, email] of [
			"someone@latent.space",
			"swyx@cognition.ai",
		].entries()) {
			await database.transaction(async (tx) => {
				await signup.lockInstanceSignups(tx);
				await signup.assertNewUserAllowed(tx, email);
				await tx.insert(users).values({ id: userId(200 + index), email });
			});
		}
		assert.equal(
			await signup.getSignupDenial(database, "new@policy-verify.invalid"),
			"PublicSignupFull",
		);
		assert.equal(
			await signup.getSignupDenial(database, "someone@ai.engineer"),
			null,
		);
		assert.equal(
			await signup.getSignupDenial(database, "guest0@policy-verify.invalid"),
			null,
		);
		console.log(
			JSON.stringify({
				check: "whitelist_and_existing_login_at_signup_capacity",
				passed: true,
			}),
		);

		await database
			.insert(videos)
			.values(
				Array.from({ length: 24 }, (_, index) => videoData(index, userId(0))),
			);
		const videoBarrier = barrier();
		const videoResults = await Promise.allSettled(
			[24, 25].map((index) =>
				database.transaction(async (tx) => {
					await tx.select({ count: count() }).from(videos);
					await videoBarrier();
					await videoLimits.insertVideoWithLimit(
						tx,
						videoData(index, userId(0)),
					);
				}),
			),
		);
		assert.equal(
			videoResults.filter((result) => result.status === "fulfilled").length,
			1,
		);
		const rejectedVideo = videoResults.find(
			(result) => result.status === "rejected",
		);
		assert(
			rejectedVideo?.status === "rejected" &&
				rejectedVideo.reason instanceof videoLimits.VideoLimitError,
		);
		assert.equal(
			(
				await database
					.select({ count: count() })
					.from(videos)
					.where(eq(videos.ownerId, userId(0)))
			)[0]?.count,
			25,
		);
		console.log(
			JSON.stringify({
				check: "parallel_video_24_to_25_with_earlier_snapshot",
				passed: true,
			}),
		);

		await database.delete(videos).where(eq(videos.id, videoId(0)));
		await database.transaction((tx) =>
			videoLimits.insertVideoWithLimit(tx, videoData(26, userId(0))),
		);
		assert.equal(
			(
				await database
					.select({ count: count() })
					.from(videos)
					.where(eq(videos.ownerId, userId(0)))
			)[0]?.count,
			25,
		);
		console.log(
			JSON.stringify({ check: "deleted_video_frees_slot", passed: true }),
		);

		await database
			.insert(videos)
			.values(
				Array.from({ length: 25 }, (_, index) =>
					videoData(100 + index, userId(200)),
				),
			);
		await database.transaction((tx) =>
			videoLimits.insertVideoWithLimit(tx, videoData(125, userId(200))),
		);
		assert.equal(
			(
				await database
					.select({ count: count() })
					.from(videos)
					.where(eq(videos.ownerId, userId(200)))
			)[0]?.count,
			26,
		);
		console.log(
			JSON.stringify({
				check: "whitelist_exempt_from_video_limit",
				passed: true,
			}),
		);
	} finally {
		await database.$client.end();
	}
}

main().catch((error: unknown) => {
	console.error(
		error instanceof Error
			? `${error.name}: ${error.message}`
			: "Verification failed",
	);
	process.exitCode = 1;
});
