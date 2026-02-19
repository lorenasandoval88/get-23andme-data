import { fetch23andMeParticipants } from './data/genomicData.js';

const participants = await fetch23andMeParticipants(5);
console.log("Sample participants:", participants);