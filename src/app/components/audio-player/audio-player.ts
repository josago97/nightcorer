import { Component, inject } from '@angular/core';
import { AudioPlayerService } from '../../services/audio-player';
import { FormsModule } from '@angular/forms';
import { TimePipe } from '../../pipes/time-pipe';

@Component({
  selector: 'app-audio-player',
  imports: [FormsModule, TimePipe],
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.css',
})
export class AudioPlayer {
  protected readonly player = inject(AudioPlayerService);
}
