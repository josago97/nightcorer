import { computed, effect, inject, NgZone, Service, signal } from '@angular/core';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import { Utils } from '../utils/utils';
import { AudioEncoder } from '../models/audio-encoder';

@Service()
export class AudioPlayerService {
  private readonly ngZone = inject(NgZone);

  private readonly _isPlaying = signal(false);
  private readonly _originalDuration = signal(0);
  private readonly _currentTime = signal(0);
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
  private startTime: number = 0;

  isPlaying = this._isPlaying.asReadonly();
  currentTime = this._currentTime.asReadonly();
  duration = computed(() => this._originalDuration() / this.speed());
  percentagePlayed = computed(() => (this.duration() > 0 ? this._currentTime() / this.duration() * 100 : 0));
  semitones = this._semitones.asReadonly();
  speed = this._speed.asReadonly();
  volume = this._volume.asReadonly();

  constructor() {
    this.audioContext = new AudioContext();
    this.registerWorkletPromise = this.registSoundtouchWorklet(this.audioContext);

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this._volume();
    this.gainNode.connect(this.audioContext.destination);

    effect(() => {
      if (this._isPlaying()) {
        this.stopProgressLoop();
        this.startProgressLoop();
      } else {
        this.stopProgressLoop();
      }
    });
  }

  private registSoundtouchWorklet(audioContext: BaseAudioContext) {
    return SoundTouchNode.register(audioContext, './js/soundtouch-processor.js')
      .catch(console.error);
  }

  setPercentagePlayed(value: number) {
    const wasPlaying = this.isPlaying();
    this.pause();
    this._currentTime.set(this.duration() * value / 100);

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
    const clamped = Utils.clamp(value, 0.1, 8);
    this._speed.set(clamped);

    if (this.audioSource && this.soundtouch) {
      this.soundtouch.playbackRate.value = clamped;
      this.audioSource.playbackRate.value = clamped;
    }
  }

  setVolume(value: number) {
    const clamped = Utils.clamp(value, 0, 1);
    this._volume.set(clamped);
    this.gainNode.gain.value = clamped;
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
    this._currentTime.set(0);

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

    const currentTime = this.currentTime();
    this.startTime = this.audioContext.currentTime - currentTime;
    this.audioSource.start(0, currentTime);

    this._isPlaying.set(true);
    this.audioSource.onended = () => {
      if (this._isPlaying() && !this.audioSource?.loop) this.stop();
    };
  }

  pause() {
    this.audioSource?.stop();
    this._isPlaying.set(false);
  }

  stop() {
    this.pause();
    this._currentTime.set(0);
  }

  private startProgressLoop() {
    this.ngZone.runOutsideAngular(() => {
      const tick = () => {
        if (this._isPlaying()) {
          const currentTime = this.audioContext.currentTime - this.startTime;
          this._currentTime.set(currentTime);
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
      Math.ceil(audioBuffer.sampleRate * this.duration()),
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
