export abstract class AudioEncoder {
  private static readonly MAX_AMPLITUDE = 0x7FFF; // 32767
  private static readonly MIN_AMPLITUDE = 0x8000; // 32768

  abstract get fileExtension(): string;

  abstract encode(audioBuffer: AudioBuffer): Blob;

  getFileName(fileName: string) {
    return `${fileName}.${this.fileExtension}`;
  }

  /**
   * Converts a Float32 audio sample (-1 to 1) to Int16 (-32768 to 32767).
   */
  protected floatSampleToInt16(sample: number): number {
    const normalizedSample = Math.max(-1, Math.min(1, sample));
    const amplitude = normalizedSample < 0 ? AudioEncoder.MIN_AMPLITUDE : AudioEncoder.MAX_AMPLITUDE;

    return normalizedSample * amplitude;
  }
}
