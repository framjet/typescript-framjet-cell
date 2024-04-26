import {
  type AnyCell,
  CellGetter,
  CellGetterOptions,
  type CellOnMount,
  type CellSetter,
  type SetCell,
} from '.';

export interface Cell<Value> {
  [Symbol.toStringTag]: string;

  read(
    getter: CellGetter,
    setter: CellSetter,
    options: CellGetterOptions,
  ): Value;

  isWritable(): boolean;

  hasInitialValue(): boolean;

  is(cell: AnyCell): boolean;

  name: string;
}

export interface WritableCell<Value, Args extends unknown[], Result>
  extends Cell<Value> {
  read(
    getter: CellGetter,
    setter: CellSetter,
    options: CellGetterOptions<SetCell<Args, Result>>,
  ): Value;

  write(getter: CellGetter, setter: CellSetter, ...args: Args): Result;

  onMount?: CellOnMount<Args, Result>;
}

export interface CellWithInitialValue<Value> {
  initialValue: Value | undefined;
}
