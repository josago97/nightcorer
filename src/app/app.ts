import { Component, computed, inject, signal } from '@angular/core';
import { AudioPlayerService } from './services/audio-player';
import { saveAs } from 'file-saver';
import { FormsModule } from '@angular/forms';
import { FileInput } from "./components/file-input/file-input";
import { AudioPlayer } from "./components/audio-player/audio-player";
import { AudioEncoder } from './models/audio-encoder';
import { WavEncoder } from './models/wav-encoder';
import { TimePipe } from "./pipes/time-pipe";
import { DecimalPipe } from '@angular/common';
import { ControlInputNumber } from "./components/control-input-number/control-input-number";
import { Mp3Encoder } from './models/mp3-encoder';

@Component({
  selector: 'app-root',
  imports: [FormsModule, FileInput, AudioPlayer, TimePipe, DecimalPipe, ControlInputNumber],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly player = inject(AudioPlayerService);

  readonly audioFile = signal<File | null>(null);
  readonly isExporting = signal<boolean>(false);
  readonly durationDiference = computed(() => this.player.estimatedDuration() - this.player.originalDuration());

  get volumePercent() {
    return Math.round(this.player.volume() * 100);
  }

  set volumePercent(value: number) {
    this.player.setVolume(value / 100);
  }

  get speedPercent() {
    return Math.round(this.player.speed() * 100);
  }

  set speedPercent(value: number) {
    this.player.setSpeed(value / 100);
  }

  get reverbPercent() {
    return Math.round(this.player.reverb() * 100);
  }

  set reverbPercent(value: number) {
    this.player.setReverb(value / 100);
  }

  async importAudioFile(file: File) {
    this.audioFile.set(file);
    const buffer = await file.arrayBuffer();

    this.player.playAudio(buffer);
  }

  convertOtherSong() {
    this.player.stop();
    this.audioFile.set(null);
  }

  exportToWav() {
    this.export(new WavEncoder())
  }

  exportToMp3() {
    this.export(new Mp3Encoder())
  }

  private async export(encoder: AudioEncoder) {
    const audioFile = this.audioFile();

    if (!audioFile) {
      console.error('No audio file to export.');
      return;
    }

    try {
      this.isExporting.set(true);
      const file = await this.player.export(encoder);
      const audioFileName = audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) || audioFile.name
      const saveFileName = encoder.getFileName(`${audioFileName}_edited`)
      saveAs(file, saveFileName);
    } finally {
      this.isExporting.set(false);
    }
  }
}
