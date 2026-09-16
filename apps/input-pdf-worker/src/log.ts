/* One JSON object per line on stdout: Cloud Logging reads `severity` and `message` and indexes the
   rest as jsonPayload, so alerts can filter on `event` and `submissionId`. */

export type Severity = 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR';

export type Logger = (severity: Severity, event: string, fields?: Record<string, unknown>) => void;

export const log: Logger = (severity, event, fields = {}) => {
	process.stdout.write(
		JSON.stringify({
			severity,
			message: event,
			event,
			service: 'input-pdf-worker',
			time: new Date().toISOString(),
			...fields
		}) + '\n'
	);
}
