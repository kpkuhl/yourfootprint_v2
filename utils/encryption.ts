// Simple encryption utility for household IDs
// Uses a combination of base64 encoding and a simple cipher to obfuscate the data

const ENCRYPTION_KEY = 'yourfootprint_household_id_key_2025';

function simpleEncrypt(text: string): string {
  try {
    // Convert to base64 first
    const base64 = btoa(text);
    
    // Simple XOR cipher with the key
    let encrypted = '';
    for (let i = 0; i < base64.length; i++) {
      const charCode = base64.charCodeAt(i);
      const keyChar = ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
      encrypted += String.fromCharCode(charCode ^ keyChar);
    }
    
    // Convert the result to base64 for safe storage
    return btoa(encrypted);
  } catch (error) {
    console.error('Encryption failed:', error);
    return text; // Fallback to original text if encryption fails
  }
}

function simpleDecrypt(encryptedText: string): string {
  try {
    // Decode from base64
    const decoded = atob(encryptedText);
    
    // Reverse the XOR cipher
    let decrypted = '';
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i);
      const keyChar = ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
      decrypted += String.fromCharCode(charCode ^ keyChar);
    }
    
    // Decode from base64
    return atob(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    return encryptedText; // Fallback to original text if decryption fails
  }
}

export function encryptHouseholdId(householdId: string): string {
  return simpleEncrypt(householdId);
}

export function decryptHouseholdId(encryptedHouseholdId: string): string {
  return simpleDecrypt(encryptedHouseholdId);
} 