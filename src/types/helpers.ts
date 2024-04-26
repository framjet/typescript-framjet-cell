import { type Cell, type WritableCell } from '.';

export type CellGetter = <V>(cell: Cell<V>) => V;
export type CellSetter = <V, Args extends unknown[], Result>(
  cell: WritableCell<V, Args, Result>,
  ...args: Args
) => Result;

export type SetCell<Args extends unknown[], Result> = <A extends Args>(
  ...args: A
) => Result;

export type SetCellAction<Value> = Value | ((prev: Value) => Value);

export type CellGetterOptions<SetSelf = never> = {
  readonly signal: AbortSignal;
  readonly setSelf: SetSelf;
  readonly setter: CellSetter;
};

export type CellRead<Value, SetSelf = never> = (
  get: CellGetter,
  set: CellSetter,
  options: CellGetterOptions<SetSelf>,
) => Value;

export type CellWrite<Args extends unknown[], Result> = (
  get: CellGetter,
  set: CellSetter,
  ...args: Args
) => Result;

export type CellOnUnmount = () => void;
export type CellOnMount<Args extends unknown[], Result> = <
  S extends SetCell<Args, Result>,
>(
  setCell: S,
) => CellOnUnmount | void;

export type ExtractCellValue<T> =
  T extends Cell<infer Value> ? Value : never

export type ExtractCellArgs<T> =
  T extends WritableCell<unknown, infer TArgs, infer _TResult>
    ? TArgs
    : never

export type ExtractCellResult<T> =
  T extends WritableCell<unknown, infer _TArgs, infer TResult>
    ? TResult
    : never

export type AnyCellValue = unknown;
export type AnyCell = Cell<AnyCellValue>;
export type AnyWritableCell = WritableCell<AnyCellValue, unknown[], unknown>;
