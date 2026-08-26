export function formatDuration(seconds: number | null) {
	if (seconds === null || !Number.isFinite(seconds) || seconds < 0)
		return "Unavailable";
	const rounded = Math.round(seconds);
	if (rounded < 60) return `${rounded}s`;
	if (rounded < 3600) return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
	return `${(seconds / 3600).toFixed(1)}h`;
}

export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
	return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

export function formatDate(value: string) {
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeZone: "UTC",
	}).format(new Date(value));
}
