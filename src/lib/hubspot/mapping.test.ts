import type { RoomSnapshot, SubmitRequest } from '$lib/types';
import { describe, expect, it } from 'vitest';
import {
	MAX_FIELD_CHARS,
	PAGE_NAME,
	buildSubmission,
	splitName,
	truncate,
	type HubSpotSubmission
} from './mapping';

const room: RoomSnapshot = {
	unit: 'cm',
	ceilingHeightCm: 260,
	closed: true,
	outline: [
		[0, 0],
		[400, 0],
		[400, 300],
		[0, 300]
	],
	walls: [],
	openings: [],
	unanswered: [],
	finished: true
};

function base(over: Partial<SubmitRequest> = {}): SubmitRequest {
	return {
		submissionId: 'sub-1',
		answers: {
			c_identity: { name: 'Ana Maria Popescu', email: 'ana@example.com' },
			c_rooms: ['bucatarie', 'living'],
			c_stage: 'renovam',
			c_household: {
				adults: 2,
				children: 1,
				childAges: ['3', '7'],
				elderly: 'nu',
				pets: ['caine', 'pisica']
			},
			k1: 'gatim_zilnic'
		},
		readback: 'Ce am înțeles: gătiți zilnic.',
		files: [],
		drawing: null,
		pageUri: 'http://localhost:5173/rezumat',
		...over
	};
}

function fieldMap(s: HubSpotSubmission): Record<string, string> {
	return Object.fromEntries(s.fields.map((f) => [f.name, f.value]));
}

describe('splitName', () => {
	it('splits on the last space', () => {
		expect(splitName('Ana Maria Popescu')).toEqual({
			firstname: 'Ana Maria',
			lastname: 'Popescu'
		});
	});

	it('gives only a firstname for a single word', () => {
		expect(splitName('Ana')).toEqual({ firstname: 'Ana', lastname: '' });
	});

	it('ignores leading and trailing spaces', () => {
		expect(splitName('  Ana  ')).toEqual({ firstname: 'Ana', lastname: '' });
		expect(splitName('  Ana Popescu  ')).toEqual({ firstname: 'Ana', lastname: 'Popescu' });
	});

	it('collapses inner runs of whitespace', () => {
		expect(splitName('Ana   Maria\tPopescu')).toEqual({
			firstname: 'Ana Maria',
			lastname: 'Popescu'
		});
	});

	it('handles an empty name', () => {
		expect(splitName('')).toEqual({ firstname: '', lastname: '' });
	});
});

describe('truncate', () => {
	it('leaves short values alone', () => {
		expect(truncate('abc')).toBe('abc');
	});

	it('cuts at MAX_FIELD_CHARS with a trailing ellipsis', () => {
		const long = 'x'.repeat(MAX_FIELD_CHARS + 500);
		const out = truncate(long);
		expect(out).toHaveLength(MAX_FIELD_CHARS);
		expect(out.endsWith('…')).toBe(true);
		expect(out.slice(0, -1)).toBe('x'.repeat(MAX_FIELD_CHARS - 1));
	});

	it('leaves a value of exactly the limit untouched', () => {
		const exact = 'y'.repeat(MAX_FIELD_CHARS);
		expect(truncate(exact)).toBe(exact);
	});
});

describe('buildSubmission', () => {
	it('maps every field', () => {
		const f = fieldMap(buildSubmission(base()));
		expect(f.firstname).toBe('Ana Maria');
		expect(f.lastname).toBe('Popescu');
		expect(f.email).toBe('ana@example.com');
		expect(f.um_rooms).toBe('bucatarie;living');
		expect(f.um_stage).toBe('renovam');
		expect(f.um_adults).toBe('2');
		expect(f.um_children).toBe('1');
		expect(f.um_child_ages).toBe('3;7');
		expect(f.um_elderly).toBe('nu');
		expect(f.um_pets).toBe('caine;pisica');
		expect(f.um_readback).toBe('Ce am înțeles: gătiți zilnic.');
		expect(JSON.parse(f.um_answers_json)).toEqual(base().answers);
		expect(f.um_submission_id).toBe('sub-1');
	});

	it('tags every field as a contact property', () => {
		for (const field of buildSubmission(base()).fields) {
			expect(field.objectTypeId).toBe('0-1');
			expect(typeof field.value).toBe('string');
		}
	});

	it('sets the context and no legal consent options', () => {
		const s = buildSubmission(base());
		expect(s.context).toEqual({
			pageUri: 'http://localhost:5173/rezumat',
			pageName: PAGE_NAME
		});
		expect(s.legalConsentOptions).toBeUndefined();
	});

	it('adds hutk only when provided', () => {
		expect(buildSubmission(base()).context.hutk).toBeUndefined();
		const withHutk = { ...base(), hutk: 'abc123' } as SubmitRequest;
		expect(buildSubmission(withHutk).context.hutk).toBe('abc123');
	});

	it('omits fields whose value would be empty', () => {
		const s = buildSubmission(
			base({
				answers: { c_identity: { name: 'Ana', email: 'ana@example.com' } },
				readback: ''
			})
		);
		const names = s.fields.map((x) => x.name);
		expect(names).toContain('firstname');
		expect(names).not.toContain('lastname');
		expect(names).not.toContain('um_rooms');
		expect(names).not.toContain('um_stage');
		expect(names).not.toContain('um_adults');
		expect(names).not.toContain('um_child_ages');
		expect(names).not.toContain('um_pets');
		expect(names).not.toContain('um_readback');
		expect(names).not.toContain('um_plan_files');
		expect(names).not.toContain('um_plan_drawing_json');
		expect(names).not.toContain('um_plan_drawing_png');
	});

	it('drops empty entries from ;-joined lists', () => {
		const f = fieldMap(
			buildSubmission(
				base({
					answers: {
						c_identity: { name: 'Ana Pop', email: 'a@b.ro' },
						c_rooms: ['bucatarie', '', 'living'],
						c_household: { adults: 1, children: 0, childAges: [], pets: [] }
					}
				})
			)
		);
		expect(f.um_rooms).toBe('bucatarie;living');
		expect(f.um_children).toBe('0');
		expect(f.um_child_ages).toBeUndefined();
		expect(f.um_pets).toBeUndefined();
	});

	it('writes one plan-file line per file, with "-" for an untagged file', () => {
		const f = fieldMap(
			buildSubmission(
				base({
					files: [
						{ url: 'http://mock/1.pdf', name: 'plan.pdf', roomId: 'bucatarie' },
						{ url: 'http://mock/2.jpg', name: 'foto.jpg', roomId: null }
					]
				})
			)
		);
		expect(f.um_plan_files).toBe(
			'http://mock/1.pdf | plan.pdf | bucatarie\nhttp://mock/2.jpg | foto.jpg | -'
		);
	});

	it('adds the drawing fields when a drawing exists', () => {
		const f = fieldMap(
			buildSubmission(
				base({
					drawing: { jsonUrl: 'http://mock/d.json', pngUrl: 'http://mock/d.png', room }
				})
			)
		);
		expect(f.um_plan_drawing_png).toBe('http://mock/d.png');
		expect(JSON.parse(f.um_plan_drawing_json)).toEqual(room);
	});

	it('omits the drawing fields when there is none', () => {
		const names = buildSubmission(base()).fields.map((x) => x.name);
		expect(names).not.toContain('um_plan_drawing_json');
		expect(names).not.toContain('um_plan_drawing_png');
	});

	it('truncates over-long multi-line values', () => {
		const f = fieldMap(base() && buildSubmission(base({ readback: 'z'.repeat(80_000) })));
		expect(f.um_readback).toHaveLength(MAX_FIELD_CHARS);
		expect(f.um_readback.endsWith('…')).toBe(true);
	});

	it('survives a malformed answers object', () => {
		const s = buildSubmission(
			base({ answers: { c_identity: 'nope', c_rooms: 'nope', c_household: 42 } })
		);
		const names = s.fields.map((x) => x.name);
		expect(names).not.toContain('firstname');
		expect(names).not.toContain('email');
		expect(names).toContain('um_submission_id');
	});
});
