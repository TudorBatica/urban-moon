/* One JSON object per line: Cloud Logging reads `severity` and `message` and indexes the rest, so
   alerts can filter on `event` and `submissionId`. Never log session URIs or file contents. */

export type Severity = 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR';

export function log(severity: Severity, event: string, fields: Record<string, unknown> = {}): void {
	const line = JSON.stringify({
		severity,
		message: event,
		event,
		service: 'input-capture-web',
		time: new Date().toISOString(),
		...fields
	});
	if (severity === 'ERROR') console.error(line);
	else console.log(line);
}
