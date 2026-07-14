export abstract class AudioEncoder {

  abstract get fileExtension(): string;

  abstract encode(audioBuffer: AudioBuffer): Blob;

  getFileName(fileName: string) {
    return `${fileName}.${this.fileExtension}`;
  }
}
