
import localforage from "localforage";
import { displayProfiles } from "./src/js/get23_loadProfiles.js";
export { localforage };

export { localforage };
export { load23andMeFile, parse23Txt } from './src/js/get23_loadTxts.js';
export {loadStats} from './src/js/get23_loadStats.js';
export { displayProfiles } from './src/js/get23_loadProfiles.js';

export { fetch23andMeParticipants,
        fetchProfile,
        getLastAllUsersSource,
        getLastProfileSource

      } from './src/js/data/get23_allUsers.js';