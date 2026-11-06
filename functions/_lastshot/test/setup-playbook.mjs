/* The shared playbook module is a plain script (window.RTG_PLAYBOOK in a
   page). Node tests load it here, before anything that reads it. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.RTG_PLAYBOOK = require('../../../assets/playbook.js');
