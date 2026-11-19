/**
 * Where to send a user after they sign in or sign up, based on the `next` param
 * captured when an auth check bounced them here.
 */
export function destinationAfterAuth(next?: string) {
  if (next === 'sell') return '/sell' as const;
  if (next === 'checkout') return '/checkout' as const;
  if (next === 'cart') return '/cart' as const;
  return '/' as const;
}
