"use client";

import { useEffect, useRef, useState } from "react";

export function OperatorPlayer({ src, hls }: { src: string; hls: boolean }) {
	const ref = useRef<HTMLVideoElement>(null);
	const [error, setError] = useState(false);
	useEffect(() => {
		const video = ref.current;
		if (!video || !hls) return;
		let disposed = false;
		let destroy = () => {};
		if (video.canPlayType("application/vnd.apple.mpegurl")) {
			video.src = src;
			return;
		}
		void import("hls.js")
			.then(({ default: Hls }) => {
				if (disposed) return;
				if (!Hls.isSupported()) {
					setError(true);
					return;
				}
				const player = new Hls();
				destroy = () => player.destroy();
				player.on(Hls.Events.ERROR, (_event, data) => {
					if (data.fatal) setError(true);
				});
				player.loadSource(src);
				player.attachMedia(video);
			})
			.catch(() => {
				if (!disposed) setError(true);
			});
		return () => {
			disposed = true;
			destroy();
		};
	}, [src, hls]);
	return (
		<div className="overflow-hidden rounded-xl border border-gray-5 bg-black">
			<video
				ref={ref}
				src={hls ? undefined : src}
				controls
				playsInline
				preload="metadata"
				className="aspect-video max-h-[70vh] w-full"
				onError={() => setError(true)}
			>
				<track kind="captions" />
			</video>
			{error && (
				<p role="alert" className="bg-gray-1 p-4 text-sm text-gray-11">
					Playback unavailable. The recording may still be processing or your
					session may have expired.{" "}
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="text-blue-11 underline"
					>
						Reload recording
					</button>
					.
				</p>
			)}
		</div>
	);
}
