import { rgb } from 'pdf-lib';

/* The PDF follows the web app's look: ink on white, hairlines, a serif for headings. */

export const A4 = { width: 595.28, height: 841.89 };

export const MARGIN = { top: 64, right: 51, bottom: 64, left: 51 };

export const CONTENT_WIDTH = A4.width - MARGIN.left - MARGIN.right;

export const COLOR = {
	ink: rgb(0.078, 0.078, 0.078),
	soft: rgb(0.353, 0.349, 0.333),
	grey: rgb(0.478, 0.475, 0.459),
	hair: rgb(0.878, 0.875, 0.851),
	wash: rgb(0.925, 0.922, 0.902),
	white: rgb(1, 1, 1)
};

export const TYPE = {
	title: { font: 'serif', size: 32 },
	section: { font: 'serif', size: 24 },
	chapter: { font: 'serif', size: 16 },
	question: { font: 'sans', size: 8.5, color: COLOR.grey },
	answer: { font: 'sans', size: 10.5, color: COLOR.ink },
	body: { font: 'sans', size: 10, color: COLOR.soft },
	small: { font: 'sans', size: 8, color: COLOR.grey }
} as const;
