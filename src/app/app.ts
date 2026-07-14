import { Component, inject, signal } from '@angular/core';
import { AudioPlayerService } from './services/audio-player';
import { saveAs } from 'file-saver';
import { FormsModule } from '@angular/forms';
import { FileInput } from "./components/file-input/file-input";
import { AudioPlayer } from "./components/audio-player/audio-player";
import { AudioEncoder } from './models/audio-encoder';
import { WavEncoder } from './models/wav-encoder';

@Component({
  selector: 'app-root',
  imports: [FormsModule, FileInput, AudioPlayer],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly player = inject(AudioPlayerService);

  readonly audioFile = signal<File | null>(null);

  async importAudioFile(file: File) {
    this.audioFile.set(file);
    const buffer = await file.arrayBuffer();

    this.player.playAudio(buffer);
  }

  exportToWav() {
    this.export(new WavEncoder())
  }

  private async export(encoder: AudioEncoder) {
    const audioFile = this.audioFile;

    if (!audioFile) {
      console.error('No audio file to export.');
      return;
    }

    const file = await this.player.export(encoder);
    const audioFileName = audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) || audioFile.name
    const saveFileName = encoder.getFileName(`${audioFileName}_edited`)
    saveAs(file, saveFileName);
  }
}
