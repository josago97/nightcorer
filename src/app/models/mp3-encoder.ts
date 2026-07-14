import * as lamejs from 'lamejs';
import { AudioEncoder } from './audio-encoder';
/*
export class Mp3Encoder extends BaseEncoder {

  private static readonly BITES_PER_SAMPLE = 32;

  // Can be anything but make it a multiple of 576 to make encoders life easier
  private static readonly CHUNK_BLOCK_SIZE = 576 * 2;

  encodeMp3(audioBuffer: AudioBuffer, bitrate: number = 320, cb): Blob {
    let channelsCount = audioBuffer.numberOfChannels;
  
    if (channelsCount !== 1 && channelsCount !== 2) {
      throw new Error('Expecting mono or stereo audioBuffer');
    }

    // lame fails to encode stereo audio if bitrate is lower than 96.
    // in which case, we force sound to be mono (use only channel 0)
    if (bitrate < 96) {
      channelsCount = 1;
    }

    const channelSamples = this.getSamples(audioBuffer, Mp3Encoder.BITES_PER_SAMPLE);
    const mp3encoder = new lamejs.Mp3Encoder(channelsCount, audioBuffer.sampleRate, bitrate);

    return new Blob(mp3Data, { type: 'audio/mp3' });
  }

  private encodeChunk() {
    var mp3buf;
    if (channels === 1) {
      var chunk = buffers[0].subarray(blockIndex, blockIndex + BLOCK_SIZE);
      mp3buf = mp3encoder.encodeBuffer(chunk);
    } else {
      var chunkL = buffers[0].subarray(blockIndex, blockIndex + BLOCK_SIZE);
      var chunkR = buffers[1].subarray(blockIndex, blockIndex + BLOCK_SIZE);
      var mp3buf = mp3encoder.encodeBuffer(chunkL, chunkR);
    }

    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    blockIndex += BLOCK_SIZE;
  }


  
    var bufferLength = audioBuffer.length;
  
  
    // can be anything but make it a multiple of 576 to make encoders life easier
    var BLOCK_SIZE = 1152;
    
    var mp3Data = [];
  
    var blockIndex = 0;
  
    function encodeChunk() {
      var mp3buf;
      if (channels === 1) {
        var chunk = buffers[0].subarray(blockIndex, blockIndex + BLOCK_SIZE);
        mp3buf = mp3encoder.encodeBuffer(chunk);
      } else {
        var chunkL = buffers[0].subarray(blockIndex, blockIndex + BLOCK_SIZE);
        var chunkR = buffers[1].subarray(blockIndex, blockIndex + BLOCK_SIZE);
        var mp3buf = mp3encoder.encodeBuffer(chunkL, chunkR);
      }
  
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
  
      blockIndex += BLOCK_SIZE;
    }
  
    function update() {
      if (blockIndex >= bufferLength) {
        // finish writing mp3
        var mp3buf = mp3encoder.flush();
  
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
  
        return cb(new Blob(mp3Data, { type: 'audio/mp3' }));
      }
  
      var start = performance.now();
  
      while (blockIndex < bufferLength && performance.now() - start < 15) {
        encodeChunk();
      }
  
      //onProgress && onProgress(blockIndex / bufferLength);
      setTimeout(update, 16.7);
    }
  
    update();
  }
}*/
