import { Component, input, model } from '@angular/core';

@Component({
  selector: 'app-control-input-number',
  imports: [],
  templateUrl: './control-input-number.html',
  styleUrl: './control-input-number.css',
})
export class ControlInputNumber {
  readonly label = input.required<string>();
  readonly value = model.required<number>();
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly boxStep = input<number>(1);
  readonly sliderStep = input<number>(1);
  readonly isDecimal = input<boolean>(true);
  readonly unit = input<string>('');

  setValue(newValue: number) {
    let value = newValue;

    if (newValue < this.min()) {
      value = this.min();
    } else if (newValue > this.max()) {
      value = this.max();
    }

    if (!this.isDecimal()) {
      value = Math.round(value);
    }

    this.value.set(value);
  }
}
