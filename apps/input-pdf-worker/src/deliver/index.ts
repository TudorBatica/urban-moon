import type { Bucket } from '@urban-moon/bucket';
import type { Manifest } from '@urban-moon/domain-data/schema';
import type { Logger } from '../log';

/* Delivery: what happens to a built PDF (docs/arhitecture.md, step 12). HubSpot comes later; until then the PDF stays
   in the bucket and delivery records that nothing was sent. */

export interface DeliveryInput {
	bucket: Bucket;
	submissionId: string;
	manifest: Manifest;
	pdf: Uint8Array;
	log: Logger;
}

/** What output/delivery.json records. HubSpot fills `hubspot` with each step's id as it succeeds. */
export interface DeliveryRecord {
	hubspot: Record<string, unknown> | null;
}

export type Deliver = (input: DeliveryInput) => Promise<DeliveryRecord>;

export const skipDelivery: Deliver = async ({ submissionId, log }) => {
	log('INFO', 'delivery_skipped', { submissionId, reason: 'hubspot_not_implemented' });
	return { hubspot: null };
};
