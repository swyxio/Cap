"use client";

import { useState, useTransition } from "react";
import { getInstanceStorageUsage } from "@/actions/instance-admin";
import { formatBytes } from "./format";

export function StorageUsage() {
	const [result, setResult] = useState<Awaited<
		ReturnType<typeof getInstanceStorageUsage>
	> | null>(null);
	const [pending, startTransition] = useTransition();
	return (
		<section
			className="rounded-xl border border-gray-5 bg-gray-1 p-4"
			aria-label="Storage usage"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-semibold text-gray-12">Storage</h2>
					<p className="text-xs text-gray-10">
						Default Railway bucket · completed objects, including source files,
						previews, and logos
					</p>
				</div>
				<button
					type="button"
					disabled={pending}
					className="rounded-lg border border-gray-6 px-3 py-2 text-sm font-medium disabled:opacity-50"
					onClick={() =>
						startTransition(async () => {
							try {
								setResult(await getInstanceStorageUsage());
							} catch {
								setResult({
									status: "unavailable",
									message:
										"Could not measure storage. Refresh to sign in again or retry.",
								});
							}
						})
					}
				>
					{pending
						? "Measuring…"
						: result
							? "Measure again"
							: "Measure storage"}
				</button>
			</div>
			<div aria-live="polite" className="mt-3 text-sm">
				{!result && (
					<p className="text-gray-10">
						Not measured yet. Scans storage only when requested; this is not a
						billing estimate.
					</p>
				)}
				{result?.status === "unavailable" && (
					<p className="text-red-500">{result.message}</p>
				)}
				{result?.status === "available" && (
					<>
						<p className="font-semibold tabular-nums">
							{!result.complete || result.missingSizes > 0 ? "At least " : ""}
							{formatBytes(result.bytes)}{" "}
							<span className="font-normal text-gray-10">
								across {result.objects.toLocaleString()} objects · measured{" "}
								{new Date(result.measuredAt).toLocaleTimeString()}
							</span>
						</p>
						{!result.complete && (
							<p className="mt-1 text-amber-600">
								Partial scan: these are lower bounds, not the full bucket total.
							</p>
						)}
						{result.missingSizes > 0 && (
							<p className="mt-1 text-amber-600">
								Sizes unavailable for {result.missingSizes} objects.
							</p>
						)}
						<p className="mt-1 text-xs text-gray-10">
							Custom buckets and Google Drive excluded (
							{result.excludedRecordings} recordings). In-progress multipart
							uploads are not included. Listing is live, not an atomic snapshot.
						</p>
						<details className="mt-3">
							<summary className="cursor-pointer text-sm text-blue-600">
								Storage by user
							</summary>
							<dl className="mt-2 grid gap-2 text-xs">
								{result.users.map((user) => (
									<div
										key={user.id}
										className="flex flex-wrap justify-between gap-2"
									>
										<dt className="break-all">{user.email}</dt>
										<dd className="tabular-nums">
											{!result.complete || result.missingSizes > 0 ? "≥ " : ""}
											{formatBytes(user.bytes)} · {user.objects} objects
										</dd>
									</div>
								))}
								<div className="flex justify-between gap-2">
									<dt>Shared / unassigned files</dt>
									<dd>
										{!result.complete || result.missingSizes > 0 ? "≥ " : ""}
										{formatBytes(result.unattributedBytes)}
									</dd>
								</div>
							</dl>
						</details>
					</>
				)}
			</div>
		</section>
	);
}
