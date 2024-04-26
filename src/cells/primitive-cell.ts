import { BasePrimitiveCell } from './base-primitive-cell';

export class PrimitiveCell<T> extends BasePrimitiveCell<T> {
  constructor(initialValue?: T, hasInitialValue = true) {
    super(initialValue, hasInitialValue);
  }
}
