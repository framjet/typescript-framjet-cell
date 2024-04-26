import { BaseCell } from './base-cell';
import type {
  CellGetter,
  CellGetterOptions,
  CellOnMount,
  CellRead,
  CellSetter,
  CellWrite,
  SetCell,
  WritableCell
} from '..';

export class CalculatedCell<T> extends BaseCell<T> {
  readonly #readMethod: CellRead<T> | undefined;

  constructor(readMethod?: CellRead<T>) {
    super();

    this.#readMethod = readMethod;
  }

  override read(
    getter: CellGetter,
    setter: CellSetter,
    options: CellGetterOptions
  ): T {
    if (this.#readMethod === undefined) {
      return undefined as T;
    }

    return this.#readMethod(getter, setter, options);
  }
}

export class CalculatedWritableCell<T, Args extends unknown[], Result>
  extends CalculatedCell<T>
  implements WritableCell<T, Args, Result> {
  readonly #writeMethod: CellWrite<Args, Result> | undefined;
  #onMount: CellOnMount<Args, Result> | undefined;

  constructor(
    readMethod?: CellRead<T, SetCell<Args, Result>>,
    writeMethod?: CellWrite<Args, Result>
  ) {
    super(readMethod);

    this.#writeMethod = writeMethod;
  }

  write(getter: CellGetter, setter: CellSetter, ...args: Args): Result {
    if (this.#writeMethod === undefined) {
      throw new Error(`Unable to write method: ${this.#writeMethod}`);
    }

    return this.#writeMethod(getter, setter, ...args);
  }

  override isWritable(): boolean {
    return this.#writeMethod !== undefined;
  }

  get onMount(): CellOnMount<Args, Result> | undefined {
    return this.#onMount;
  }

  set onMount(cb: CellOnMount<Args, Result>) {
    this.#onMount = cb;
  }
}
