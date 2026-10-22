import { getRequestConfig } from 'next-intl/server';
import core from '../../messages/en/core.json';
import p1 from '../../messages/en/p1.json';
import p2t from '../../messages/en/p2t.json';
import p4 from '../../messages/en/p4.json';
import p5 from '../../messages/en/p5.json';
import p6 from '../../messages/en/p6.json';
import p7 from '../../messages/en/p7.json';
import ui from '../../messages/en/ui.json';
import { mergeMessages } from './merge';

/**
 * One message file per stream (apps/web/messages/en/<stream>.json), merged here. New keys are
 * namespaced by stream (`p2t.*`); keys that existed before the split keep their names.
 */
const en = mergeMessages({ core, ui, p1, p2t, p4, p6, p5, p7 });

// English only for now. Hindi and Punjabi will add messages/hi/ and messages/pa/ and pick
// the locale from the user's preference.
export default getRequestConfig(async () => ({ locale: 'en', messages: en }));
