import {
  BaseEffectCell,
  type CellGetterWithPeek,
  type CellSetterWithRecurse,
  type CleanupFn,
} from './base-effect-cell';
import type {
  CellGetter,
  CellGetterOptions,
  CellSetter,
  SetCell,
  SetCellAction,
} from '..';

type EffectCellFn = (
  getter: CellGetterWithPeek,
  setter: CellSetterWithRecurse,
) => void | CleanupFn;

export class EffectCell extends BaseEffectCell<void> {
  readonly #effectFn: EffectCellFn;

  constructor(effectFn: EffectCellFn) {
    super();

    this.#effectFn = effectFn;
  }

  protected effect(
    getter: CellGetterWithPeek,
    setter: CellSetterWithRecurse,
  ): void | CleanupFn {
    return this.#effectFn(getter, setter);
  }

  protected readEffect(
    _getter: CellGetter,
    _setter: CellSetter,
    _options: CellGetterOptions<SetCell<[SetCellAction<void>], void>>,
  ): void {
    // nop
  }
}
