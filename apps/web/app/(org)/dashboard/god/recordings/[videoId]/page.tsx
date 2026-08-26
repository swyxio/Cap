import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getInstanceRecording } from "@/lib/instance-recording";
import { formatDate, formatDuration } from "../../format";
import { OperatorPlayer } from "./Player";

export const metadata: Metadata = {
	title: "Recording — God view",
	robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function OperatorRecording({
	params,
}: {
	params: Promise<{ videoId: string }>;
}) {
	const recording = await getInstanceRecording((await params).videoId);
	const mp4 =
		recording.source.type === "desktopMP4" ||
		recording.source.type === "webMP4";
	const videoType =
		recording.source.type === "desktopSegments"
			? "segments-master"
			: mp4
				? "mp4"
				: recording.source.type === "MediaConvert" &&
						(recording.skipProcessing || recording.jobStatus !== "COMPLETE")
					? "master"
					: "video";
	const src = `/api/playlist?${new URLSearchParams({ videoId: recording.id, videoType })}`;
	return (
		<div className="mx-auto w-full max-w-5xl space-y-5 text-gray-12">
			<Link href="/dashboard/god" className="text-sm text-blue-11">
				← All recordings
			</Link>
			<header>
				<p className="text-xs font-medium text-gray-10">
					God view · owner-only playback
				</p>
				<h1 className="mt-1 break-words text-2xl font-semibold">
					{recording.name}
				</h1>
				<p className="mt-2 break-words text-sm text-gray-10">
					{recording.ownerEmail ?? "Unknown owner"} ·{" "}
					{recording.orgName ?? "Unknown organization"} ·{" "}
					{formatDate(recording.createdAt.toISOString())} UTC
				</p>
			</header>
			<div className="flex flex-wrap gap-3 text-xs">
				<span className="rounded-md bg-gray-3 px-2 py-1">
					{recording.public ? "Public link" : "Private — remains private"}
				</span>
				<span className="rounded-md bg-gray-3 px-2 py-1">
					{recording.isScreenshot
						? "Screenshot"
						: formatDuration(recording.duration)}
				</span>
				<span className="rounded-md bg-gray-3 px-2 py-1">
					{recording.source.type}
				</span>
			</div>
			{recording.isScreenshot ? (
				recording.download ? (
					<Image
						unoptimized
						width={
							recording.width && recording.width > 0 ? recording.width : 1280
						}
						height={
							recording.height && recording.height > 0 ? recording.height : 720
						}
						src={recording.download.downloadUrl}
						alt={recording.name}
						className="max-h-[70vh] w-full rounded-xl border border-gray-5 object-contain"
					/>
				) : (
					<output className="rounded-xl border border-gray-5 p-6 text-sm">
						Screenshot unavailable. Its file may still be uploading or storage
						could not be reached.
					</output>
				)
			) : (
				<OperatorPlayer src={src} hls={!mp4} />
			)}
			{recording.download && (
				<a
					href={recording.download.downloadUrl}
					download={recording.download.fileName}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex rounded-lg border border-gray-6 px-4 py-2 text-sm"
				>
					Download original
				</a>
			)}
			<p className="text-xs text-gray-10">
				Read-only operator access. This does not change visibility or grant
				access to other users. Download links expire; reload this page to renew
				them.
			</p>
		</div>
	);
}
