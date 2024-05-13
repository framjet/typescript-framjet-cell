import type { Cell, CellGetter, CellSetter } from '..';
import { BaseCell } from './base-cell';
import { PrimitiveCell } from './primitive-cell';

export type LazyCellProvider<T> = (
  getter: CellGetter,
  setter: CellSetter
) => Cell<T>;

export class LazyCell<Value> extends BaseCell<Value> {
  protected readonly cell: PrimitiveCell<Cell<Value> | undefined>;
  protected readonly provider: LazyCellProvider<Value>;

  constructor(provider: LazyCellProvider<Value>, name?: string) {
    super();

    if (name !== undefined) {
      this.name = name;
    }

    this.cell = new PrimitiveCell<Cell<Value> | undefined>().rename(`${this.name}.cell`);
    this.provider = provider;
  }

  override read(getter: CellGetter, setter: CellSetter): Value {
    let c = getter(this.cell);

    if (c !== undefined) {
      return getter(c);
    }

    c = this.provider(getter, setter);
    setter(this.cell, c);

    return getter(c);
  }
}
