import type { QaChapter } from '../answers';
import type { Writer } from '../layout';
import { COLOR, TYPE } from '../theme';

const NONE = { ...TYPE.answer, color: COLOR.grey };

export function drawAnswers(w: Writer, chapters: QaChapter[]): void {
	w.addPage();
	w.text('Răspunsuri', TYPE.section, { after: 18 });

	for (const ch of chapters) {
		w.ensure(90);
		w.space(8);
		w.text(ch.label, TYPE.chapter, { after: 6 });
		w.rule({ color: COLOR.ink, thickness: 0.7, after: 10 });

		for (const row of ch.rows) {
			const lines = row.answer.length ? row.answer : ['Fără răspuns'];
			const height =
				w.measure(row.question, TYPE.question) +
				lines.reduce((h, l) => h + w.measure(l, TYPE.answer), 0) +
				14;
			/* Keep a question with its answer when they fit on one page. */
			w.ensure(Math.min(height, 400));
			w.text(row.question, TYPE.question, { after: 3 });
			for (const line of lines) w.text(line, row.answer.length ? TYPE.answer : NONE);
			w.space(6);
			w.rule({ after: 8 });
		}
	}
}
