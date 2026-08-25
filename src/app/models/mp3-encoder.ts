import * as lamejs from '@breezystack/lamejs';
import { AudioEncoder } from './audio-encoder';

export class Mp3Encoder extends AudioEncoder {
  private static readonly BITRATE = 320; // kbps
  // Can be anything but make it a multiple of 576 to make encoders life easier
  private static readonly CHUNK_BLOCK_SIZE = 576 * 2;

  override get fileExtension(): string {
    return 'mp3';
  }

  override encode(audioBuffer: AudioBuffer): Blob {
    let numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;

    if (numberOfChannels !== 1 && numberOfChannels !== 2) {
      throw new Error('Expecting mono or stereo audioBuffer');
    }

    // lame fails to encode stereo audio if bitrate is lower than 96.
    // in which case, we force sound to be mono (use only channel 0)
    if (Mp3Encoder.BITRATE < 96) {
      numberOfChannels = 1;
    }

    const mp3encoder = new lamejs.Mp3Encoder(numberOfChannels, sampleRate, Mp3Encoder.BITRATE);
    const pcmSamplesByChannel = this.floatBufferTo16BitPCM(audioBuffer);
    const mp3Data = this.encodeChannels(mp3encoder, pcmSamplesByChannel);

    return new Blob(mp3Data, { type: 'audio/mp3' });
  }

  private floatBufferTo16BitPCM(audioBuffer: AudioBuffer): Int16Array[] {
    const pcmSamplesByChannel: Int16Array[] = [];

    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channel = audioBuffer.getChannelData(i);
      const pcmSamples = this.floatChannelTo16BitPCM(channel);

      pcmSamplesByChannel.push(pcmSamples);
    }

    return pcmSamplesByChannel;
  }

  private floatChannelTo16BitPCM(channel: Float32Array): Int16Array {
    const output = new Int16Array(channel.length);

    for (let i = 0; i < channel.length; i++) {
      output[i] = this.floatSampleToInt16(channel[i]);
    }

    return output;
  }

  private encodeChannels(encoder: lamejs.Mp3Encoder, channels: Int16Array[]): Uint8Array<ArrayBuffer>[] {
    const chuncksEncoded: Uint8Array<ArrayBuffer>[] = [];
    const left = channels[0];
    const right = channels.at(1);

    for (let i = 0; i < channels[0].length; i += Mp3Encoder.CHUNK_BLOCK_SIZE) {
      const leftChunk = left.subarray(i, i + Mp3Encoder.CHUNK_BLOCK_SIZE);
      const rightChunk = right ? right.subarray(i, i + Mp3Encoder.CHUNK_BLOCK_SIZE) : undefined;

      const chunckEncoded = right
        ? encoder.encodeBuffer(leftChunk, rightChunk)
        : encoder.encodeBuffer(leftChunk);

      if (chunckEncoded.length > 0)
        chuncksEncoded.push(new Uint8Array(chunckEncoded));
    }

    const end = encoder.flush();
    if (end.length > 0) chuncksEncoded.push(new Uint8Array(end));

    return chuncksEncoded;
  }
}
