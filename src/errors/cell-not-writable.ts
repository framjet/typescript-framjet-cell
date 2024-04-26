import { AnyCell } from '../types';
import { CellError } from './cell-error';

export class CellIsNotWritableError extends CellError {
  constructor(cell: AnyCell) {
    super(`The cell ${cell} is not writable type`);
  }
}
