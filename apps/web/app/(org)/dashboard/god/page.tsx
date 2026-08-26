import type { Metadata } from "next";
import Link from "next/link";
import { getInstanceOverview } from "@/lib/instance-admin";
import { formatDate, formatDuration } from "./format";
import { StorageUsage } from "./StorageUsage";

export const metadata: Metadata = {
	title: "God view — Cap",
	robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function GodView({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const input = Object.fromEntries(
		Object.entries(params).map(([key, value]) => [
			key,
			Array.isArray(value) ? value[0] : value,
		]),
	);
	const data = await getInstanceOverview(input);
	const { summary, filters } = data;
	const pageHref = (updates: Record<string, string>) => {
		const query = new URLSearchParams({ ...filters, ...updates });
		return `/dashboard/god?${query.toString()}`;
	};
	const pages = Math.max(1, Math.ceil(data.totalFiltered / data.pageSize));
	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 text-gray-12">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold tracking-tight">God view</h1>
						<span className="rounded-full bg-blue-3 px-2.5 py-1 text-xs font-medium text-blue-11">
							Owner only · read-only
						</span>
					</div>
					<p className="mt-2 max-w-2xl text-sm text-gray-10">
						Every user, organization, and recording on cap.swyx.io—including
						private recordings. The organization switcher does not limit this
						view.
					</p>
				</div>
				<a
					href={pageHref({ page: String(data.page) })}
					className="rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-sm font-medium"
				>
					Refresh data
				</a>
			</header>

			<section
				aria-label="Instance totals"
				className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-5 bg-gray-5 lg:grid-cols-4"
			>
				<Metric
					label="Accounts"
					value={summary.users.toLocaleString()}
					detail={`${summary.trustedUsers} whitelisted · ${summary.publicUsers} public`}
				/>
				<Metric
					label="Public signup pool"
					value={`${summary.publicUsers} / ${summary.publicSignupLimit || "Unlimited"}`}
					detail="Whitelisted accounts do not use these slots"
				/>
				<Metric
					label="Stored recordings"
					value={(summary.recordings + summary.screenshots).toLocaleString()}
					detail={`${summary.recordings} videos · ${summary.screenshots} screenshots`}
				/>
				<Metric
					label="Recorded duration"
					value={
						summary.recordings === 0
							? "No videos"
							: formatDuration(summary.durationSeconds)
					}
					detail={`Known for ${summary.knownDurationCount} of ${summary.recordings} videos; not watch time`}
				/>
			</section>

			<StorageUsage />

			<section className="space-y-3" aria-label="All recordings">
				<div className="flex items-baseline justify-between gap-3">
					<h2 className="text-lg font-semibold">All recordings</h2>
					<p className="text-sm tabular-nums text-gray-10">
						{data.totalFiltered.toLocaleString()} matching
					</p>
				</div>
				<form
					action="/dashboard/god"
					className="grid grid-cols-1 gap-3 rounded-xl border border-gray-5 bg-gray-1 p-4 sm:grid-cols-2 xl:grid-cols-[2fr_1.4fr_1.2fr_1fr_auto]"
				>
					<label className="space-y-1 text-xs font-medium">
						Search
						<input
							name="q"
							defaultValue={filters.q}
							maxLength={200}
							placeholder="Title, name, or email"
							className="block w-full rounded-lg border border-gray-6 bg-gray-2 px-3 py-2 text-sm"
						/>
					</label>
					<label className="space-y-1 text-xs font-medium">
						User
						<select
							name="userId"
							defaultValue={filters.userId}
							className="block w-full rounded-lg border border-gray-6 bg-gray-2 px-3 py-2 text-sm"
						>
							<option value="">All users</option>
							{data.userRows.map((user) => (
								<option key={user.id} value={user.id}>
									{user.email}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1 text-xs font-medium">
						Organization
						<select
							name="orgId"
							defaultValue={filters.orgId}
							className="block w-full rounded-lg border border-gray-6 bg-gray-2 px-3 py-2 text-sm"
						>
							<option value="">All organizations</option>
							{data.orgs.map((org) => (
								<option key={org.id} value={org.id}>
									{org.name}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1 text-xs font-medium">
						Type
						<select
							name="kind"
							defaultValue={filters.kind}
							className="block w-full rounded-lg border border-gray-6 bg-gray-2 px-3 py-2 text-sm"
						>
							<option value="">All types</option>
							<option value="recordings">Videos</option>
							<option value="screenshots">Screenshots</option>
						</select>
					</label>
					<div className="flex items-end gap-3">
						<button
							className="rounded-lg bg-gray-12 px-4 py-2 text-sm font-medium text-gray-1"
							type="submit"
						>
							Filter
						</button>
						<Link href="/dashboard/god" className="py-2 text-sm text-gray-10">
							Reset
						</Link>
					</div>
				</form>
				<div className="overflow-x-auto rounded-xl border border-gray-5 bg-gray-1">
					<table className="w-full min-w-[760px] text-left text-sm">
						<caption className="sr-only">
							Recordings across all organizations, including private recordings
						</caption>
						<thead className="border-b border-gray-5 bg-gray-3 text-xs text-gray-10">
							<tr>
								{[
									"Recording",
									"Owner",
									"Organization",
									"Visibility",
									"Duration",
									"Created (UTC)",
								].map((label) => (
									<th key={label} scope="col" className="px-4 py-3 font-medium">
										{label}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-4">
							{data.videos.map((video) => (
								<tr key={video.id} className="hover:bg-gray-2">
									<td className="max-w-xs px-4 py-3">
										<Link
											prefetch={false}
											href={`/dashboard/god/recordings/${encodeURIComponent(video.id)}`}
											className="block break-words font-medium text-blue-11 hover:underline"
										>
											{video.name}
										</Link>
										<span className="mt-1 block text-xs text-gray-10">
											{video.isScreenshot
												? "Screenshot"
												: (video.sourceType ?? "Unknown source")}
											{video.jobStatus ? ` · ${video.jobStatus}` : ""}
										</span>
									</td>
									<td className="max-w-[220px] break-words px-4 py-3">
										<Link
											href={pageHref({ userId: video.ownerId, page: "1" })}
											className="hover:underline"
										>
											{video.ownerName ?? video.ownerEmail}
										</Link>
										<span className="block text-xs text-gray-10">
											{video.ownerEmail}
										</span>
									</td>
									<td className="px-4 py-3">
										{video.orgName ?? "Unknown organization"}
									</td>
									<td className="px-4 py-3">
										<span
											className={`rounded-md px-2 py-1 text-xs ${video.public ? "bg-gray-3 text-gray-11" : "bg-amber-3 text-amber-11"}`}
										>
											{video.public ? "Public link" : "Private"}
										</span>
									</td>
									<td className="whitespace-nowrap px-4 py-3 tabular-nums">
										{video.isScreenshot
											? "—"
											: formatDuration(video.durationSeconds)}
									</td>
									<td className="whitespace-nowrap px-4 py-3 text-xs text-gray-10">
										{formatDate(video.createdAt)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{data.videos.length === 0 && (
						<p className="p-8 text-center text-sm text-gray-10">
							No recordings match these filters. Try another user or reset the
							filters.
						</p>
					)}
				</div>
				<nav
					aria-label="Recording pages"
					className="flex items-center justify-between text-sm"
				>
					<span className="text-gray-10">
						Page {data.page} of {pages} · {data.pageSize} per page
					</span>
					<div className="flex gap-4">
						{data.page > 1 && (
							<Link href={pageHref({ page: String(data.page - 1) })}>
								← Previous
							</Link>
						)}
						{data.page < pages && (
							<Link href={pageHref({ page: String(data.page + 1) })}>
								Next →
							</Link>
						)}
					</div>
				</nav>
			</section>

			<section className="space-y-3" aria-label="Usage by user">
				<div>
					<h2 className="text-lg font-semibold">Usage by user</h2>
					<p className="mt-1 text-xs text-gray-10">
						All accounts, including those with no recordings. Videos and
						screenshots both use quota; deletion frees a slot. Totals are
						instance-wide, regardless of filters.
					</p>
				</div>
				<div className="overflow-x-auto rounded-xl border border-gray-5 bg-gray-1">
					<table className="w-full min-w-[650px] text-left text-sm">
						<thead className="border-b border-gray-5 bg-gray-3 text-xs text-gray-10">
							<tr>
								{[
									"Account",
									"Access",
									"Stored / limit",
									"Video duration",
									"Last recording",
								].map((label) => (
									<th scope="col" key={label} className="px-4 py-3 font-medium">
										{label}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-4">
							{data.userRows.map((user) => {
								const used = user.recordings + user.screenshots;
								return (
									<tr key={user.id}>
										<td className="px-4 py-3">
											<Link
												href={pageHref({ userId: user.id, page: "1" })}
												className="break-all font-medium text-blue-11 hover:underline"
											>
												{user.email}
											</Link>
											<span className="block text-xs text-gray-10">
												{user.name ?? "No name"} · joined{" "}
												{formatDate(user.createdAt)}
											</span>
										</td>
										<td className="px-4 py-3 text-xs">
											{user.whitelisted ? "Whitelisted" : "Public · revocable"}
										</td>
										<td className="px-4 py-3 tabular-nums">
											<span
												className={
													!user.whitelisted &&
													summary.publicVideoLimit > 0 &&
													used >= summary.publicVideoLimit
														? "font-semibold text-red-500"
														: ""
												}
											>
												{used} /{" "}
												{user.whitelisted || !summary.publicVideoLimit
													? "Unlimited"
													: summary.publicVideoLimit}
											</span>
											<span className="block text-xs text-gray-10">
												{user.recordings} videos · {user.screenshots}{" "}
												screenshots
											</span>
										</td>
										<td className="px-4 py-3 tabular-nums">
											{user.recordings
												? formatDuration(user.durationSeconds)
												: "—"}
											<span className="block text-xs text-gray-10">
												{user.knownDurationCount}/{user.recordings} known
											</span>
										</td>
										<td className="px-4 py-3 text-xs">
											{user.lastRecordingAt
												? formatDate(user.lastRecordingAt)
												: "None yet"}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>
			<p className="text-xs text-gray-10">
				This view cannot delete content, change sharing, or suspend accounts.
				Playback uses your owner access; it does not make a private recording
				public. Watch analytics and provider billing are not connected here.
			</p>
		</div>
	);
}

function Metric({
	label,
	value,
	detail,
}: {
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<div className="bg-gray-1 p-4">
			<p className="text-xs font-medium text-gray-10">{label}</p>
			<p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
				{value}
			</p>
			<p className="mt-1 text-xs leading-relaxed text-gray-10">{detail}</p>
		</div>
	);
}
