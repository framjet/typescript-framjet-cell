import {
  type AnyCell, cell,
  type Cell,
  type CellGetter,
  type CellGetterOptions,
  type CellSetter
} from '..';

export abstract class BaseCell<Value> implements Cell<Value> {
  static #cellNr = 0;
  readonly #hasInitialValue: boolean;
  readonly #initialValue: Value | undefined;
  name: string;

  protected constructor(initialValue?: Value, hasInitialValue = true) {
    this.#hasInitialValue = hasInitialValue;
    this.#initialValue = initialValue;
    this.name = `Cell<${BaseCell.#cellNr++}>`;
  }

  get initialValue(): Value | undefined {
    return this.#initialValue;
  }

  read(
    getter: CellGetter,
    setter: CellSetter,
    options: CellGetterOptions,
  ): Value {
    return getter(this);
  }

  isWritable(): boolean {
    return true;
  }

  hasInitialValue(): boolean {
    return this.#hasInitialValue;
  }

  is(cell: AnyCell): boolean {
    return this === cell;
  }

  rename(name: string): this {
    this.name = name;

    return this;
  }

  get [Symbol.toStringTag]() {
    return `${this.constructor.name}:${this.name}`;
  }

  toString(): string {
    return this[Symbol.toStringTag];
  }
}
