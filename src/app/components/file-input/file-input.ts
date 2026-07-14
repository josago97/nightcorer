import { Component, output, signal } from '@angular/core';

@Component({
  selector: 'app-file-input',
  imports: [],
  templateUrl: './file-input.html',
  styleUrl: './file-input.css',
})
export class FileInput {
  private readonly FAIL_DRAG_CLASS = 'fail-drag';
  private readonly SUCCESS_DRAG_CLASS = 'success-drag';

  readonly file = signal<File | null>(null);
  readonly fileChanged = output<File>();

  protected async importFile(event: Event) {
    const inputElement = event.target as HTMLInputElement;

    if (inputElement?.files) {
      const file = inputElement.files[0] as File;
      this.changeFile(file);
    }
  }

  protected onEnterDrag(event: DragEvent) {
    const element = event.target as HTMLElement;
    const items = event.dataTransfer?.items;

    if (items && items.length > 0) {
      const item = items[0];

      if (this.isAudio(item)) {
        element.classList.add(this.SUCCESS_DRAG_CLASS);
      } else {
        element.classList.add(this.FAIL_DRAG_CLASS);
      }
    }
  }

  protected onLeaveDrag(event: DragEvent) {
    const element = event.target as HTMLElement;
    element.classList.remove(this.FAIL_DRAG_CLASS);
    element.classList.remove(this.SUCCESS_DRAG_CLASS);
  }

  protected onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  protected onDropFile(event: DragEvent) {
    event.preventDefault();
    this.onLeaveDrag(event);

    const files = event.dataTransfer?.files;

    if (files && files.length > 0) {
      const file = files[0];

      if (this.isAudio(file)) {
        this.changeFile(file);
      }
    }
  }

  private changeFile(newFile: File) {
    this.file.set(newFile);
    this.fileChanged.emit(newFile);
  }

  private isAudio(item: DataTransferItem | File) {
    return item.type.startsWith("audio/")
  }
}
