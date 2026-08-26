type ObjectPage = {
	Contents?: { Key?: string; Size?: number }[];
	IsTruncated?: boolean;
	NextContinuationToken?: string;
};

export async function measureInstanceStorage(
	list: (continuationToken?: string) => Promise<ObjectPage>,
	users: { id: string; email: string }[],
) {
	const MAX_PAGES = 100;
	const deadline = Date.now() + 30_000;
	const owners = new Map(
		users.map((user) => [user.id, { ...user, bytes: 0, objects: 0 }]),
	);
	const tokens = new Set<string>();
	const seenKeys = new Set<string>();
	let token: string | undefined;
	let bytes = 0;
	let objects = 0;
	let missingSizes = 0;
	let unattributedBytes = 0;
	let complete = false;
	for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
		if (Date.now() >= deadline) break;
		const page = await list(token);
		for (const object of page.Contents ?? []) {
			if (object.Key) {
				if (seenKeys.has(object.Key)) continue;
				seenKeys.add(object.Key);
			}
			objects++;
			const size =
				typeof object.Size === "number" &&
				Number.isFinite(object.Size) &&
				object.Size >= 0
					? object.Size
					: null;
			if (size === null) missingSizes++;
			bytes += size ?? 0;
			const owner = owners.get(object.Key?.split("/")[0] ?? "");
			if (owner) {
				owner.bytes += size ?? 0;
				owner.objects++;
			} else unattributedBytes += size ?? 0;
		}
		if (!page.IsTruncated) {
			complete = true;
			break;
		}
		token = page.NextContinuationToken;
		if (!token || tokens.has(token)) break;
		tokens.add(token);
	}
	return {
		complete,
		bytes,
		objects,
		missingSizes,
		unattributedBytes,
		measuredAt: new Date().toISOString(),
		users: Array.from(owners.values()).sort((a, b) => b.bytes - a.bytes),
	};
}
