import { LINE_ICONS, lineIcon } from './lineIcons';

/* The question data names icons from the older clay set; the redesign draws only the
   appliances and the coffee in line, and these are their names in the line set. */

const BY_ICON: Record<string, string> = {
	fridge: 'fridge',
	fridge2: 'sideBySide',
	fridgeIn: 'builtIn',
	chest: 'freezer',
	wine: 'wine',
	aragaz: 'aragaz',
	hobOven: 'hobOven',
	flame: 'gas',
	bolt: 'electric',
	mixed: 'mixed',
	pipe: 'gridGas',
	bottle: 'gasBottle',
	hobGas: 'hobGas',
	hob: 'hobVitro',
	hobInd: 'hobInduction',
	dishwasher: 'dishwasher',
	washerKitchen: 'washer',
	espresso: 'espresso',
	capsule: 'capsule',
	ibric: 'moka',
	filter: 'filter',
	nocoffee: 'noCoffee',
	/* the small appliances */
	microCounter: 'microwave',
	toaster: 'toaster',
	kettle: 'kettle',
	multicooker: 'multicooker',
	blender: 'blender',
	handmixer: 'handMixer',
	airfryer: 'airFryer',
	sandwich: 'sandwichMaker',
	juicer: 'juicer',
	grill: 'grill',
	breadmaker: 'breadMaker',
	mixer: 'standMixer'
};

/** Where one clay icon stands for two objects, the option's value decides. */
const BY_VALUE: Record<string, string> = {
	combina: 'combi'
};

export function lineKey(icon?: string, value?: string): string | undefined {
	const key = (value && BY_VALUE[value]) || (icon && BY_ICON[icon]);
	return key && key in LINE_ICONS ? key : undefined;
}

export function line(icon?: string, value?: string): string {
	const key = lineKey(icon, value);
	return key ? lineIcon(key) : '';
}
