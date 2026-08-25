import { AudioEncoder } from './audio-encoder';

export class WavEncoder extends AudioEncoder {
  private static readonly HEADER_LENGTH = 44;

  override get fileExtension(): string {
    return 'wav';
  }

  override encode(audioBuffer: AudioBuffer): Blob {
    const channels = audioBuffer.numberOfChannels;

    if (channels !== 1 && channels !== 2) {
      throw new Error('Expecting mono or stereo audioBuffer');
    }

    const sampleRate = audioBuffer.sampleRate;
    const bufferLength = audioBuffer.length;
    const arrayBuffer = new ArrayBuffer(WavEncoder.HEADER_LENGTH + 2 * bufferLength * channels);
    const view = new DataView(arrayBuffer);

    this.writeHeader(view, sampleRate, channels, bufferLength);

    const channelBuffers: Float32Array[] = [];
    for (let i = 0; i < channels; i++) {
      channelBuffers.push(audioBuffer.getChannelData(i));
    }

    this.writeData(view, channelBuffers, bufferLength);

    return new Blob([view], { type: 'audio/wav' });
  }

  private writeHeader(view: DataView, sampleRate: number, channels: number, bufferLength: number, bitsPerSample: number = 16) {

    // WAVE Header
    // http://soundfile.sapp.org/doc/WaveFormat/
    // 52 49 46 46     R I F F
    // 24 08 00 00     chunk size
    // 57 41 56 45     W A V E

    // 66 6d 74 20     F T M █
    // 10 00 00 00     subchunk size
    // 01 00           audio format
    // 02 00           number of channels
    // 44 AC 00 00     sample rate
    // 88 58 01 00     bitrate
    // 04 00           block align
    // 10 00           bit per sample
    // 64 61 74 61     d a t a
    // 00 08 00 00     subchunk2 size

    const subchunk2 = bufferLength * channels * bitsPerSample / 8;
    const byteRate = sampleRate * channels * bitsPerSample / 8;

    // "RIFF" chunk descriptor
    this.writeString(view, 0, 'RIFF'); // "RIFF" chunk descriptor
    view.setUint32(4, 36 + subchunk2, true); // Chunk size = 36 + subchunk2
    this.writeString(view, 8, 'WAVE'); // W A V E

    // "ftm" sub-chunk
    this.writeString(view, 12, 'fmt ');  // F T M █
    view.setUint32(16, 16, true); // Subchunk1Size = 16
    view.setUint16(20, 1, true); // AudioFormat = 1 (PCM, linear quantization)
    view.setUint16(22, channels, true); // Number of channels
    view.setUint32(24, sampleRate, true); // Sample rate
    view.setUint32(28, byteRate, true); // Byte rate
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true); // BitsPerSample

    // Data sub-chuk
    this.writeString(view, 36, 'data'); // d a t a
    view.setUint32(40, subchunk2, true); // Subchunk2 size
  }

  private writeString(view: DataView, offset: number, text: string) {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  private writeData(view: DataView, channels: Float32Array[], length: number) {
    let position = WavEncoder.HEADER_LENGTH;

    for (let i = 0; i < length; i++) {
      for (let channel of channels) {
        const sample = this.floatSampleToInt16(channel[i]);

        view.setInt16(position, sample, true);
        position += 2;
      }
    }
  }
}
