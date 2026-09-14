import { z } from 'zod';
import {
	S,
	type AppCard,
	type Field,
	type FollowUp,
	type Options,
	type Screen
} from '../catalog/screens';

/* The answers schema is derived from the catalog, so a question and its answer's shape can never
   drift apart: add a question to the catalog and it is accepted here; remove it and old answers
   to it are stripped. Every key is optional — a question may have been hidden or skipped. */

const TEXT_MAX = 5000;

/** A value from the question's options; free text when the options are computed at runtime. */
function oneOf(options: Options | undefined): z.ZodType<string> {
	if (!Array.isArray(options) || options.length === 0) return z.string().max(200);
	return z.enum(options.map((o) => o.value) as [string, ...string[]]);
}

function followUpSchema(fu: FollowUp): z.ZodType {
	switch (fu.kind) {
		case 'stepper':
			return z.number().int().min(fu.min ?? 0).max(fu.max ?? 99);
		case 'pills':
			return oneOf(fu.options);
		case 'pillsMulti':
			return z.array(oneOf(fu.options));
		default:
			return z.string().max(TEXT_MAX);
	}
}

function fieldSchema(f: Field): z.ZodType | null {
	switch (f.kind) {
		case 'heading':
			return null;
		case 'stepper':
			return z.number().int().min(f.min ?? 0).max(f.max ?? 99);
		case 'pills':
			return oneOf(f.options);
		case 'pillsMulti':
			return z.array(oneOf(f.options));
		default:
			return z.string().max(TEXT_MAX); // input, email, text
	}
}

function fieldsObject(fields: Field[]): z.ZodObject {
	const shape: Record<string, z.ZodType> = {};
	for (const f of fields) {
		const schema = f.key ? fieldSchema(f) : null;
		if (f.key && schema) shape[f.key] = schema.optional();
		if (f.other) shape[f.other.key] = z.string().max(TEXT_MAX).optional();
	}
	return z.object(shape);
}

function cardsObject(cards: AppCard[], pick?: string): z.ZodObject {
	const shape: Record<string, z.ZodType> = {};
	if (pick) shape[pick] = z.enum(cards.map((c) => c.value) as [string, ...string[]]).optional();
	for (const c of cards) {
		if (!pick && !c.always) shape[c.value] = z.boolean().optional();
		for (const g of c.groups ?? []) shape[g.key] = oneOf(g.options).optional();
	}
	return z.object(shape);
}

export const FurnitureItemSchema = z.object({
	name: z.string().max(200),
	length: z.string().max(20),
	width: z.string().max(20)
});

/** The schema of one screen's own answer (the value stored under the screen id). */
export function screenAnswerSchema(s: Screen): z.ZodType | null {
	switch (s.kind) {
		case 'single':
			return oneOf(s.options);
		case 'multi':
			return z.array(oneOf(s.options));
		case 'compound':
		case 'text':
			return fieldsObject(s.fields);
		case 'cards':
			return cardsObject(s.cards, s.pick);
		case 'furniture':
			return z.object({ items: z.array(FurnitureItemSchema).max(50) });
		default:
			return null; // chapter cards and routes hold no answer
	}
}

export interface AnswerKey {
	key: string;
	/** the screen the answer belongs to */
	screenId: string;
	role: 'screen' | 'followUp';
}

/** Every top-level key an answers record can hold, in catalog order. */
export function answerKeys(): AnswerKey[] {
	const keys: AnswerKey[] = [];
	for (const s of S) {
		if (!screenAnswerSchema(s)) continue;
		keys.push({ key: s.id, screenId: s.id, role: 'screen' });
		if (s.kind === 'single' && s.followUp)
			keys.push({ key: s.followUp.key, screenId: s.id, role: 'followUp' });
		if (s.kind === 'multi' && Array.isArray(s.options))
			for (const o of s.options)
				if (o.followUp) keys.push({ key: o.followUp.key, screenId: s.id, role: 'followUp' });
	}
	return keys;
}

function answersShape(): Record<string, z.ZodType> {
	const shape: Record<string, z.ZodType> = {};
	for (const s of S) {
		const schema = screenAnswerSchema(s);
		if (!schema) continue;
		shape[s.id] = schema.describe(s.short ?? s.title ?? s.id).optional();
		if (s.kind === 'single' && s.followUp)
			shape[s.followUp.key] = followUpSchema(s.followUp).describe(s.followUp.label).optional();
		if (s.kind === 'multi' && Array.isArray(s.options))
			for (const o of s.options)
				if (o.followUp)
					shape[o.followUp.key] = followUpSchema(o.followUp).describe(o.followUp.label).optional();
	}
	return shape;
}

/** Committed answers: unknown keys (answers to questions that no longer exist) are stripped. */
export const AnswersSchema = z.object(answersShape());

/** The same shape, refusing unknown keys — for fixtures and contract tests. */
export const StrictAnswersSchema = z.strictObject(answersShape());
