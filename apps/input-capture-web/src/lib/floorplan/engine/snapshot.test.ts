import { describe, expect, it } from 'vitest';
import { RoomSnapshotSchema } from '@urban-moon/domain-data/schema';
import { buildRoomSnapshot, computeUnanswered } from './snapshot';
import type { Model, Wall } from './model';
import { fixture, loadFixtures } from './fixtures/load';

function wall(id: string, from: [number, number], to: [number, number]): Wall {
	return {
		id,
		from: { x: from[0], y: from[1] },
		to: { x: to[0], y: to[1] },
		lengthSource: 'drawn',
		isOpen: false,
		segments: [
			{
				id: id + '-s',
				kind: 'wall',
				length: { value: Math.hypot(to[0] - from[0], to[1] - from[1]), source: 'drawn' },
				offsetFromStart: 0,
				sill: null,
				hinge: null,
				hingeSource: null,
				swing: null,
				swingSource: null
			}
		]
	};
}
const modelOf = (...walls: Wall[]): Model => ({ walls, landmarks: [] });

describe('buildRoomSnapshot', () => {
	for (const f of loadFixtures()) {
		it('is what the editor reported for ' + f.name, () => {
			expect(buildRoomSnapshot(f.model)).toEqual(f.room);
		});
	}

	it('the closed room is what the contract accepts', () => {
		const parsed = RoomSnapshotSchema.safeParse(buildRoomSnapshot(fixture('closed-room').model));
		expect(parsed.success).toBe(true);
	});

	it('reports the ring order when closed, and the walls chain by chain otherwise', () => {
		const closed = buildRoomSnapshot(fixture('closed-room').model);
		expect(closed.closed).toBe(true);
		expect(closed.walls.map((w) => w.index)).toEqual([0, 1, 2, 3]);
		expect(closed.outline).toEqual([
			[0, 0],
			[400, 0],
			[400, 300],
			[0, 300],
			[0, 0]
		]);
		const open = buildRoomSnapshot(fixture('detached-piece').model);
		expect(open.closed).toBe(false);
		/* the outline is the first chain's own points, not every piece's */
		expect(open.outline).toEqual([
			[0, 0],
			[300, 0],
			[300, 200]
		]);
	});

	it('flattens every opening out, naming the wall it is on', () => {
		const room = buildRoomSnapshot(fixture('closed-room').model);
		expect(room.openings.map((o) => [o.wallId, o.kind])).toEqual([
			['wall1', 'window'],
			['wall3', 'door']
		]);
		expect(room.openings[0].sillCm).toBe(90);
		expect(room.openings[1]).toMatchObject({ hinge: 'start', swing: 'in' });
	});

	it('carries the landmarks its walls can hold, with their gaps measured', () => {
		const room = buildRoomSnapshot(fixture('landmarks').model);
		expect(room.landmarks).toEqual([
			{
				id: 'mark1',
				kind: 'radiator',
				wallId: 'wall1',
				offsetFromStartCm: 110,
				face: 'in',
				gapBeforeCm: 10,
				gapAfterCm: 80
			},
			{
				id: 'mark2',
				kind: 'water',
				wallId: 'wall1',
				offsetFromStartCm: 250,
				face: 'out',
				gapBeforeCm: 30,
				gapAfterCm: 120
			}
		]);
	});

	it('leaves out a landmark whose wall cannot hold it', () => {
		expect(buildRoomSnapshot(fixture('hidden-landmark').model).landmarks).toEqual([]);
	});

	it('never states a ceiling height: that is the saved drawing´s', () => {
		expect(buildRoomSnapshot(fixture('closed-room').model).ceilingHeightCm).toBeNull();
	});
});

describe('computeUnanswered', () => {
	it('asks for the first wall on an empty canvas', () => {
		expect(computeUnanswered(modelOf())).toEqual(['Desenează primul perete ca să începi.']);
	});

	it('counts the free ends, in the singular for one', () => {
		const one = modelOf(wall('a', [0, 0], [100, 0]), wall('b', [100, 0], [100, 100]));
		/* welding the two spare ends of a three-wall U leaves exactly one loose */
		const three = modelOf(
			wall('a', [0, 0], [100, 0]),
			wall('b', [200, 0], [200, 100]),
			wall('c', [300, 0], [400, 0])
		);
		expect(computeUnanswered(modelOf(wall('a', [0, 0], [100, 0])))).toEqual([
			'2 capete de perete nu sunt legate de nimic încă.'
		]);
		expect(computeUnanswered(one)).toEqual(['2 capete de perete nu sunt legate de nimic încă.']);
		expect(computeUnanswered(three)).toEqual(['6 capete de perete nu sunt legate de nimic încă.']);
	});

	it('says one free end in the singular', () => {
		/* three walls meeting at one T: the only loose end is the stem's far one */
		const m = modelOf(
			wall('a', [0, 0], [200, 0]),
			wall('b', [200, 0], [400, 0]),
			wall('c', [200, 0], [200, 200]),
			wall('d', [0, 0], [0, -200]),
			wall('e', [0, -200], [400, -200]),
			wall('f', [400, -200], [400, 0])
		);
		expect(computeUnanswered(m)).toEqual(['Un capăt de perete nu e legat de nimic încă.']);
	});

	it('says the loop is not closed when every end is joined but no ring covers it', () => {
		/* a figure of eight: nothing dangles, yet the walk never covers every wall */
		const m = modelOf(
			wall('a', [0, 0], [100, 0]),
			wall('b', [100, 0], [100, 100]),
			wall('c', [100, 100], [0, 100]),
			wall('d', [0, 100], [0, 0]),
			wall('e', [100, 0], [200, 0]),
			wall('f', [200, 0], [200, 100]),
			wall('g', [200, 100], [100, 100])
		);
		expect(computeUnanswered(m)).toEqual(['Pereții nu formează încă un contur închis.']);
	});

	it('asks nothing of a closed room', () => {
		expect(computeUnanswered(fixture('closed-room').model)).toEqual([]);
		expect(buildRoomSnapshot(fixture('closed-room').model).finished).toBe(true);
	});
});
