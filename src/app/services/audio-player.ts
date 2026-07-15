import { computed, inject, NgZone, Service, signal } from '@angular/core';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import { Utils } from '../utils/utils';
import { AudioEncoder } from '../models/audio-encoder';

@Service()
export class AudioPlayerService {
  private readonly ngZone = inject(NgZone);

  private readonly _isPlaying = signal(false);
  private readonly _originalDuration = signal(0);
  private readonly _originalCurrentTime = signal(0);
  private readonly _semitones = signal(0);
  private readonly _speed = signal(1);
  private readonly _volume = signal(0.25);

  private audioBuffer: AudioBuffer | null = null;
  private audioContext: AudioContext;
  private registerWorkletPromise: Promise<void>;
  private soundtouch: SoundTouchNode | null = null;
  private audioSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode;
  private progressLoopRafId: number | null = null;
  private playStartTime: number = 0;
  private pauseOffset: number = 0;

  readonly isPlaying = this._isPlaying.asReadonly();
  readonly originalDuration = this._originalDuration.asReadonly();
  readonly estimatedDuration = computed(() => this.originalDuration() / this.speed());
  readonly estimatedCurrentTime = computed(() => this._originalCurrentTime() / this.speed());
  readonly playerProgress = computed(() => (this.estimatedDuration() > 0 ? this.estimatedCurrentTime() / this.estimatedDuration() : 0));
  readonly semitones = this._semitones.asReadonly();
  readonly speed = this._speed.asReadonly();
  readonly volume = this._volume.asReadonly();

  constructor() {
    this.audioContext = new AudioContext();
    this.registerWorkletPromise = this.registSoundtouchWorklet(this.audioContext);

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this._volume();
    this.gainNode.connect(this.audioContext.destination);
  }

  private registSoundtouchWorklet(audioContext: BaseAudioContext) {
    return SoundTouchNode.register(audioContext, './js/soundtouch-processor.js')
      .catch(console.error);
  }

  setPlayerProgress(value: number) {
    value = Utils.clamp(value, 0, 1);
    const wasPlaying = this.isPlaying();
    this.pause();
    this.pauseOffset = this.originalDuration() * value;
    this._originalCurrentTime.set(this.pauseOffset);

    if (wasPlaying) {
      this.play()
    }
  }

  setSemitones(value: number) {
    const clamped = Utils.clamp(value, -24, 24);
    this._semitones.set(clamped);

    if (this.soundtouch) {
      this.soundtouch.pitchSemitones.value = clamped;
    }
  }

  setSpeed(value: number) {
    value = Utils.clamp(value, 0.1, 8);

    if (this.isPlaying()) {
      this.pauseOffset += (this.audioContext.currentTime - this.playStartTime) * this.speed();
      this.pauseOffset = this.normalizeOffset(this.pauseOffset);
      this.playStartTime = this.audioContext.currentTime;
      this._originalCurrentTime.set(this.pauseOffset);
    }

    this._speed.set(value);

    if (this.audioSource && this.soundtouch) {
      this.soundtouch.playbackRate.value = value;
      this.audioSource.playbackRate.value = value;
    }
  }

  setVolume(value: number) {
    value = Utils.clamp(value, 0, 1);
    this._volume.set(value);
    this.gainNode.gain.value = value;
  }

  async playAudio(audio: ArrayBuffer) {
    if (this.audioSource) {
      this.audioSource.onended = null;
      this.audioSource.stop();
      this.audioSource.disconnect();
    } else {
      await this.registerWorkletPromise;
    }

    this.audioBuffer = await this.audioContext.decodeAudioData(audio);
    this._originalDuration.set(this.audioBuffer.duration);
    this._originalCurrentTime.set(0);
    this.pauseOffset = 0;

    this.play();
  }

  playPause() {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  // AudioBufferSourceNode is one-shot — every play/resume creates a new source node 
  play() {
    if (!this.audioBuffer) return;

    // It's necessary to re-create a new node because it keeps garbage from the previous play
    this.soundtouch = new SoundTouchNode({ context: this.audioContext });
    this.soundtouch.connect(this.gainNode);
    this.soundtouch.pitchSemitones.value = this._semitones();
    this.soundtouch.playbackRate.value = this._speed();

    this.audioSource = this.audioContext.createBufferSource();
    this.audioSource.connect(this.soundtouch);
    this.audioSource.buffer = this.audioBuffer;
    this.audioSource.playbackRate.value = this._speed();
    this.audioSource.loop = true;

    this.playStartTime = this.audioContext.currentTime;
    this.audioSource.start(0, this.pauseOffset);

    this._isPlaying.set(true);
    this.audioSource.onended = () => {
      if (this._isPlaying() && !this.audioSource?.loop) this.stop();
    };

    this.stopProgressLoop();
    this.startProgressLoop();
  }

  pause() {
    this.audioSource?.stop();
    this._isPlaying.set(false);
    const elapsed = (this.audioContext.currentTime - this.playStartTime) * this.speed();
    this.pauseOffset = this.normalizeOffset(this.pauseOffset + elapsed);
    this._originalCurrentTime.set(this.pauseOffset);
    this.stopProgressLoop();
  }

  stop() {
    this.pause();
    this.pauseOffset = 0;
    this._originalCurrentTime.set(0);
    this.stopProgressLoop();
  }

  private normalizeOffset(position: number): number {
    if (!this.audioBuffer)
      return position;
    else if (this.audioBuffer.duration <= 0)
      return 0;
    else if (this.audioSource && this.audioSource.loop)
      return position % this.originalDuration();
    else
      return Math.min(position, this.originalDuration());
  }

  private startProgressLoop() {
    this.ngZone.runOutsideAngular(() => {
      const tick = () => {
        if (this._isPlaying()) {
          const duration = this.originalDuration();
          const elapsed = (this.audioContext.currentTime - this.playStartTime) * this.speed();
          let currentTime = this.pauseOffset + elapsed;

          if (this.audioSource && this.audioSource.loop) {
            currentTime %= duration
          }

          this._originalCurrentTime.set(Utils.clamp(currentTime, 0, duration));
          this.progressLoopRafId = requestAnimationFrame(tick);
        }
      };

      this.progressLoopRafId = requestAnimationFrame(tick);
    });
  }

  private stopProgressLoop() {
    if (this.progressLoopRafId !== null) {
      cancelAnimationFrame(this.progressLoopRafId);
      this.progressLoopRafId = null;
    }
  }

  async export(encoder: AudioEncoder): Promise<Blob> {
    if (!this.audioBuffer)
      throw new Error('Audio cannot be null');

    const audioBuffer = this.audioBuffer;
    const semitones = this.semitones();
    const speed = this.speed();

    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      Math.ceil(audioBuffer.sampleRate * this.estimatedDuration()),
      audioBuffer.sampleRate
    );

    await this.registSoundtouchWorklet(offlineContext);
    const soundtouch = new SoundTouchNode({ context: offlineContext });
    soundtouch.connect(offlineContext.destination);
    soundtouch.pitchSemitones.value = semitones;
    soundtouch.playbackRate.value = speed;

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = speed;
    source.connect(soundtouch);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const blob = await encoder.encode(renderedBuffer);

    return blob;
  }
}
