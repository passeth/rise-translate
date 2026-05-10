export function isInternalWorkerAuthorized({
  authorizationHeader,
  expectedToken,
  production = process.env.NODE_ENV === "production",
}: {
  authorizationHeader: string | null;
  expectedToken?: string;
  production?: boolean;
}) {
  if (!expectedToken) {
    return !production;
  }

  return authorizationHeader === `Bearer ${expectedToken}`;
}
