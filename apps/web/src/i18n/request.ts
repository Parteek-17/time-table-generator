import { getRequestConfig } from 'next-intl/server';

// English only for now. Hindi and Punjabi will add messages/hi.json and messages/pa.json
// and pick the locale from the user's preference.
export default getRequestConfig(async () => ({
  locale: 'en',
  messages: (await import('../../messages/en.json')).default,
}));
