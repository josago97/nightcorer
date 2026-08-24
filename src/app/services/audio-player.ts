import { computed, inject, NgZone, Service, signal } from '@angular/core';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import { Utils } from '../utils/utils';
import { AudioEncoder } from '../models/audio-encoder';

@Service()
export class AudioPlayerService {
  private static readonly MAX_REVERB_DECAY = 4;
  private static readonly REVERB_PRE_DELAY = 0.025;
  private static readonly REVERB_VOLUME = 0.6;
  private static readonly REVERB_FRECUENCY_TO_FILTER = 250; // Coger armónicos de la voz y tonos más altos de percusión
  // Cuanto más bajo sea este número (ej. 0.05), más oscuro y alejado de "ruido blanco" sonará.
  // Un valor de 0.1 elimina el siseo y simula una sala real.
  private static readonly REVERB_NOISE_DAMPING_FACTOR = 0.2;

  private readonly ngZone = inject(NgZone);

  private readonly _isPlaying = signal(false);
  private readonly _originalDuration = signal(0);
  private readonly _originalCurrentTime = signal(0);
  private readonly _semitones = signal(0);
  private readonly _speed = signal(1);
  private readonly _volume = signal(0.25);
  private readonly _reverb = signal(0);

  private audioBuffer: AudioBuffer | null = null;
  private audioContext: AudioContext;
  private registerWorkletPromise: Promise<void>;
  private soundtouch: SoundTouchNode | null = null;
  private audioSource: AudioBufferSourceNode | null = null;
  private volumeNode: GainNode;
  private reverbNode: ReverbNode;
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
  readonly reverb = this._reverb.asReadonly();

  constructor() {
    this.audioContext = new AudioContext();
    this.registerWorkletPromise = this.registerSoundtouchWorklet(this.audioContext);

    this.volumeNode = this.audioContext.createGain();
    this.volumeNode.gain.value = this._volume();
    this.volumeNode.connect(this.audioContext.destination);

    this.reverbNode = new ReverbNode(this.audioContext,
      AudioPlayerService.REVERB_PRE_DELAY,
      AudioPlayerService.REVERB_VOLUME,
      AudioPlayerService.REVERB_FRECUENCY_TO_FILTER,
      AudioPlayerService.REVERB_NOISE_DAMPING_FACTOR);
    this.setReverb(this._reverb());
    this.reverbNode.connect(this.volumeNode);
  }

  private registerSoundtouchWorklet(audioContext: BaseAudioContext) {
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
      this.play();
    }
  }

  setReverb(value: number) {
    value = Utils.clamp(value, 0, 1);
    this._reverb.set(value);
    this.reverbNode.decay = value * AudioPlayerService.MAX_REVERB_DECAY;
  }

  setSemitones(value: number) {
    const clamped = Utils.clamp(value, -24, 24);
    this._semitones.set(clamped);

    if (this.soundtouch) {
      this.soundtouch.pitchSemitones.value = clamped;
    }
  }

  setSpeed(value: number) {
    value = Math.max(0.1, value);

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
    this._volume.set(value);
    this.volumeNode.gain.value = value;
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
    this.reverbNode.audioBuffer = this.audioBuffer;
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
    this.soundtouch.connect(this.volumeNode);
    this.soundtouch.connect(this.reverbNode.inputNode);
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

    // TODO: Esto para el eco
    //this.reverbNode.disconnect();
    //this.reverbNode.connect(this.audioContext.destination);
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
    const decay = this.reverb() * AudioPlayerService.MAX_REVERB_DECAY;

    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      Math.ceil(audioBuffer.sampleRate * this.estimatedDuration()),
      audioBuffer.sampleRate
    );

    // TODO: Esto ya se está complicando, habría que hacer una clase que gestione esta pipeline de nodos y reutilizarla para ambos contextos
    await this.registerSoundtouchWorklet(offlineContext);
    const soundtouch = new SoundTouchNode({ context: offlineContext });
    soundtouch.connect(offlineContext.destination);
    soundtouch.pitchSemitones.value = semitones;
    soundtouch.playbackRate.value = speed;

    const reverb = new ReverbNode(offlineContext,
      AudioPlayerService.REVERB_PRE_DELAY,
      AudioPlayerService.REVERB_VOLUME,
      AudioPlayerService.REVERB_FRECUENCY_TO_FILTER,
      AudioPlayerService.REVERB_NOISE_DAMPING_FACTOR);
    reverb.decay = decay;
    reverb.connect(offlineContext.destination);

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = speed;
    source.connect(soundtouch);
    source.connect(reverb.inputNode);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const blob = await encoder.encode(renderedBuffer);

    return blob;
  }
}

class ReverbNode {
  private readonly context: BaseAudioContext;
  private readonly convolverNode: ConvolverNode;
  private readonly gainNode: GainNode;
  private readonly frecuencyFilter: BiquadFilterNode;
  private readonly preDelay: number;
  private readonly noiseDampingFactor;

  private _decay: number = 0;
  private _channels: number = 2;

  constructor(context: BaseAudioContext, preDelay: number, volume: number, frecuencyToFilter: number, noiseDampingFactor: number) {
    this.context = context;
    this.preDelay = preDelay;
    this.noiseDampingFactor = noiseDampingFactor;

    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = volume;

    this.convolverNode = this.context.createConvolver();
    this.convolverNode.connect(this.gainNode);

    // Crear un filtro pasa-altos para limpiar los graves antes del reverb
    this.frecuencyFilter = this.context.createBiquadFilter();
    this.frecuencyFilter.type = 'highpass';
    this.frecuencyFilter.frequency.value = frecuencyToFilter;
    this.frecuencyFilter.connect(this.convolverNode);
  }

  get inputNode(): AudioNode {
    return this.frecuencyFilter;
  }

  set decay(value: number) {
    this._decay = value;
    this.generateImpulseResponse();
  }

  set audioBuffer(audioBuffer: AudioBuffer) {
    this._channels = audioBuffer.numberOfChannels;
    this.generateImpulseResponse();
  }

  connect(destinationNode: AudioNode) {
    this.gainNode.connect(destinationNode)
  }

  disconnect() {
    this.gainNode.disconnect();
  }

  private async generateImpulseResponse() {
    if (this._decay == 0 || this._channels == 0) {
      this.convolverNode.buffer = null;
      return;
    }

    const sampleRate = this.context.sampleRate;
    const numberOfChannels = this._channels;
    const preDelay = this.preDelay;
    const decay = this._decay;
    const duration = preDelay + decay;
    const length = Math.floor(sampleRate * duration);
    const preDelaySamples = this.preDelay * sampleRate;

    const offlineCtx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    const noiseBuffer = this.context.createBuffer(numberOfChannels, length, sampleRate);

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = noiseBuffer.getChannelData(channel);
      this.fillNoiseBuffer(channelData, preDelaySamples);
    }

    const gainNode = offlineCtx.createGain();
    gainNode.gain.setValueAtTime(0, 0);
    gainNode.gain.setValueAtTime(1, preDelay);
    gainNode.gain.setTargetAtTime(0, preDelay, decay);
    gainNode.connect(offlineCtx.destination);

    const source = offlineCtx.createBufferSource();
    source.buffer = noiseBuffer;
    source.connect(gainNode);

    source.start(0);
    this.convolverNode.buffer = await offlineCtx.startRendering();
  }

  private fillNoiseBuffer(channelData: Float32Array<ArrayBuffer>, preDelaySamples: number) {
    // Variables para el filtro de absorción acústica (Filtro Pasa-Bajos One-Pole)
    let lastOut = 0.0;

    for (let i = 0; i < channelData.length; i++) {
      if (i < preDelaySamples) {
        channelData[i] = 0;
      } else {
        // 1. Generar el ruido blanco base
        const white = Math.random() * 2 - 1;

        // 2. Aplicar el filtro matemático sobre la marcha (Absorción de agudos)
        // Esto suaviza las transiciones bruscas entre muestras aleatorias
        lastOut = lastOut + this.noiseDampingFactor * (white - lastOut);

        // 3. Guardar el resultado filtrado
        channelData[i] = lastOut;
      }
    }
  }
}