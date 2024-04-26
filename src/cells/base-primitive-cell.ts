import { BaseWritableCell } from './base-writable-cell';
import { SetCellAction, type WritableCell } from '..';

export abstract class BasePrimitiveCell<T> extends BaseWritableCell<
  T,
  [SetCellAction<T>],
  void
> {}

export type PrimitiveCellType<T> = WritableCell<T, [SetCellAction<T>], void>;
