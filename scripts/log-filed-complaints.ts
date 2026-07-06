/**
 * One-off: log the three complaints filed directly on the NYC 311 portal
 * (2026-05-16) into the local app database so complaint history is complete.
 *
 * Run once with: npx tsx scripts/log-filed-complaints.ts
 */
import { createComplaint, updateComplaint, listComplaints } from '../src/storage/complaints.js';
import type { ComplaintType } from '../src/complaints/types.js';

interface FiledComplaint {
  type: ComplaintType;
  srNumber: string;
  fields: Record<string, string>;
}

// All filed with NYC 311 on 2026-05-16 under contact Jeriel Acosta / jerielacos@gmail.com.
// Note: the app has no "litter basket request" type; #1 is logged as blocked-sidewalk
// (closest supported type) with its true nature recorded in the fields.
const FILED: FiledComplaint[] = [
  {
    type: 'blocked-sidewalk',
    srNumber: '311-27497400',
    fields: {
      address: 'Manhattan Bridge pedestrian/bicycle walkway (Manhattan-side entrance: Canal St & Bowery)',
      blockageType: 'Not enough public litter baskets along the bridge walkway',
      additionalDetails:
        'Filed as a DSNY Litter Basket Request (New Basket). NYC 311 has no app-side type for litter basket requests; recorded here as blocked-sidewalk. DSNY inspects within 5 days.',
      portalComplaintType: 'Litter Basket Request - New Basket',
      agency: 'DSNY',
    },
  },
  {
    type: 'blocked-sidewalk',
    srNumber: '311-27500965',
    fields: {
      address: 'SE corner of West 145th Street and Broadway, Manhattan',
      blockageType: 'Public city litter basket obstructing the crosswalk portion of the sidewalk',
      additionalDetails:
        'Filed as Blocked Sidewalk - Obstruction (Trash or Recycling / Blocking). City litter basket narrows the curb-ramp/crosswalk path. DSNY inspects within 5 days.',
      portalComplaintType: 'Sidewalk or Street Blocked by Trash - Obstruction',
      agency: 'DSNY',
    },
  },
  {
    type: 'blocked-sidewalk',
    srNumber: '311-27501021',
    fields: {
      address: 'West 145th Street and Broadway, Manhattan (center median island)',
      blockageType: 'Construction debris on the pedestrian median, present for several months',
      additionalDetails:
        'Filed as Street Blocked by Construction Work. Debris on the median between the SW and SE corners makes it difficult for crowds to cross. DOT responds within 10 days.',
      portalComplaintType: 'Street Blocked by Construction Work',
      agency: 'DOT',
    },
  },
];

const submittedAt = new Date('2026-05-16T14:30:00Z');

for (const c of FILED) {
  const created = createComplaint(c.type, c.fields);
  updateComplaint(created.id!, {
    status: 'confirmed',
    confirmationNumber: c.srNumber,
    submittedAt,
  });
  console.log(`Logged ${c.srNumber} as local complaint #${created.id} (${c.type})`);
}

console.log('\nCurrent complaint history:');
for (const c of listComplaints({ limit: 20 })) {
  console.log(
    `  #${c.id}  ${c.status.padEnd(9)}  ${c.type.padEnd(16)}  ${c.confirmationNumber ?? '—'}`
  );
}
