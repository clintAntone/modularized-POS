/**
 * HilotCore Cryptographic Service v1.0
 * Uses browser-native SubtleCrypto for zero-dependency, high-security hashing.
 */

/**
 * Generates a random 16-byte hex salt
 */
export const generateSalt = (): string => {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Creates a SHA-256 hash of the PIN + Salt combination
 */
export const hashPin = async (pin: string, salt: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert buffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Verifies a raw PIN against a stored hash and salt
 */
export const verifyPin = async (inputPin: string, storedSalt: string, storedHash: string): Promise<boolean> => {
  const computedHash = await hashPin(inputPin, storedSalt);
  return computedHash === storedHash;
};
