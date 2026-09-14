/* @urban-moon/domain-data — the questionnaire's shared source of truth.
   This entry has no runtime dependencies, so the browser bundle stays small; the zod schemas live
   in @urban-moon/domain-data/schema. */

export * from './types';
export * from './limits';
export * from './catalog/rooms';
export * from './catalog/predicates';
export * from './catalog/screens';

export type {
	AnswerKey,
	Manifest,
	ManifestAnswers,
	ManifestDrawing,
	ManifestFile,
	ParsedManifest
} from './schema';
