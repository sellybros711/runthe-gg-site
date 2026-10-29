/* Everything the Arcade Lab's admin and slate publishing need from the
 * dataset, behind one door. Loaded on first use only (see the Pages Function):
 * the dataset is 2MB and no game endpoint needs it. */
export * as whack from './whack.js';
export * as drop from './drop.js';
export { setLookups } from './dataset.js';
