import type { NavSource } from './types';

/**
 * P7 has no links in the signed-in app shell yet (its pages live in their own route
 * groups). Return groups here when it needs some.
 */
const nav: NavSource = async () => [];

export default nav;
