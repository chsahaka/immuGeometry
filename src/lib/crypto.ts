export async function encryptApiKey(key: string): Promise<string> {
  // Simple Base64 encode for obfuscation in localStorage / transit. 
  // In a real scenario, use true symmetric encryption with a user-provided password over WebCrypto.
  // Note: HTTPS natively encrypts the Authorization header in transit.
  return btoa(encodeURIComponent(key));
}

export async function decryptApiKey(encrypted: string): Promise<string> {
  try {
    return decodeURIComponent(atob(encrypted));
  } catch (e) {
    return "";
  }
}
