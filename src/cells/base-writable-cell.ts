import { BaseCell } from './base-cell';
import type {
  CellGetter,
  CellGetterOptions,
  CellOnMount,
  CellSetter,
  WritableCell,
  SetCell,
  SetCellAction,
} from '..';

export abstract class BaseWritableCell<T, Args extends unknown[], Result>
  extends BaseCell<T>
  implements WritableCell<T, Args, Result>
{
  #onMount: CellOnMount<Args, Result> | undefined;

  get onMount(): CellOnMount<Args, Result> | undefined {
    return this.#onMount;
  }

  set onMount(cb: CellOnMount<Args, Result>) {
    this.#onMount = cb;
  }

  write(getter: CellGetter, setter: CellSetter, ...args: Args): Result {
    const value = args[0] as SetCellAction<T>;

    return setter(
      this,
      ...([
        typeof value === 'function'
          ? (value as (prev: T) => T)(getter(this))
          : value,
      ] as Args),
    );
  }

  override read(
    getter: CellGetter,
    setter: CellSetter,
    options: CellGetterOptions<SetCell<Args, Result>>,
  ): T {
    return getter(this);
  }
}
