/* eslint-disable @typescript-eslint/no-unused-vars */

import { CalculatedWritableCell } from './cells/calculated-cell';
import { PrimitiveCell } from './cells/primitive-cell';
import type {
  Cell,
  CellRead,
  CellWithInitialValue,
  CellWrite,
  SetCell,
  WritableCell,
} from './types';

function isCellReadFunction<Value, Args extends unknown[], Result>(
  input: unknown,
): input is CellRead<Value, SetCell<Args, Result>> {
  return typeof input === 'function';
}

// writable derived cell
export function cell<Value, Args extends unknown[], Result>(
  read: CellRead<Value, SetCell<Args, Result>>,
  write: CellWrite<Args, Result>,
): WritableCell<Value, Args, Result>;

// read-only derived cell
export function cell<Value>(read: CellRead<Value>): Cell<Value>;

// write-only derived cell
export function cell<Value, Args extends unknown[], Result>(
  initialValue: Value,
  write: CellWrite<Args, Result>,
): WritableCell<Value, Args, Result> & CellWithInitialValue<Value>;

// primitive cell
export function cell<Value>(initialValue: Value): PrimitiveCell<Value>;

export function cell<Value, Args extends unknown[], Result>(
  read: Value | CellRead<Value, SetCell<Args, Result>>,
  write?: CellWrite<Args, Result>,
) {
  if (isCellReadFunction<Value, Args, Result>(read)) {
    return new CalculatedWritableCell(read, write);
  }

  if (!read && typeof write === 'function') {
    return new CalculatedWritableCell(undefined, write);
  }

  return new PrimitiveCell(read);
}
