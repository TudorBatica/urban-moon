import type { Bucket } from '@urban-moon/bucket';
import type { Manifest } from '@urban-moon/domain-data/schema';
import type { Logger } from '../log';

/* Delivery: what happens to a built PDF. Without a delivery configured the PDF stays in the bucket and delivery
   records that nothing was sent. */

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

/** The name the PDF carries in HubSpot, where it is listed with no other context. The client's name
 *  stays out of it: the file's URL is unguessable but public, and names should not travel in URLs. */
export const deliveryFileName = (submissionId: string): string => `intake-${submissionId}.pdf`;

export const skipDelivery: Deliver = async ({ submissionId, log }) => {
	log('INFO', 'delivery_skipped', { submissionId, reason: 'hubspot_not_implemented' });
	return { hubspot: null };
};
