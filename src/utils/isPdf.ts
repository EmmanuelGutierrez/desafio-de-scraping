/**
 * Verifica si un buffer es un PDF válido (magic bytes %PDF).
 */
export function isPdf(buffer: Buffer): boolean {
  return (
    buffer.length > 4 &&
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 // F
  );
}
