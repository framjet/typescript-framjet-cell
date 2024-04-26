import { Debug } from '@framjet/common';
import { BasePrimitiveCell } from './base-primitive-cell';
import type {
  AnyCellValue,
  Cell,
  CellGetter,
  CellGetterOptions,
  CellSetter,
  SetCell,
  SetCellAction
} from '..';
import { cell } from '../cell';
import { CellIsNotWritableError } from '../errors';

export type CleanupFn = () => void;
export type CellGetterWithPeek = CellGetter & { peek: CellGetter };
export type CellSetterWithRecurse = CellSetter & { recurse: CellSetter };

export type EffectCellRefState = {
  get: CellGetter;
  set: CellSetter;
  recursing: boolean;
  fromCleanUp: boolean;
  inProgress: number;
  cleanUp: (() => void) | void;
  refreshing: boolean;
  refresh: () => void;
  promise: Promise<void> | undefined;
  pendingError: unknown;
  mounted: boolean;
};

function throwIfPendingError(ref: { pendingError: null | unknown }) {
  if (ref.pendingError !== null) {
    const error = ref.pendingError;
    ref.pendingError = null;
    throw error;
  }
}

export abstract class BaseEffectCell<T> extends BasePrimitiveCell<T> {
  protected readonly refCell: Cell<EffectCellRefState> = cell(() => ({
    get: (() => {
      /* nop */
    }) as CellGetter,
    set: (() => {
      /* nop */
    }) as CellSetter,
    mounted: false,
    inProgress: 0,
    promise: undefined as Promise<void> | undefined,
    cleanUp: undefined as CleanupFn | void,
    fromCleanUp: false,
    recursing: false,
    refresh: () => {
      /* nop */
    },
    refreshing: false,
    pendingError: null as null | unknown
  }));

  protected readonly refreshCell = cell(0);

  protected readonly initCell = cell(null, (get, set) => {
    const ref = get(this.refCell);
    ref.get = get;
    ref.set = set;
    ref.mounted = true;
    ref.refresh = () => {
      try {
        ref.refreshing = true;
        set(this.refreshCell, (c) => c + 1);
      } finally {
        ref.refreshing = false;
      }
    };

    set(this.refreshCell, (c) => c + 1);

    return () => {
      ref.mounted = false;
      throwIfPendingError(ref);
      // @ts-expect-error TS2349
      ref.cleanUp?.();
      ref.cleanUp = undefined;
    };
  });

  protected readonly effectCell = cell((get) => {
    get(this.refreshCell);
    const ref = get(this.refCell);

    if (ref.mounted === true) {
      return ref.promise;
    }

    if (ref.recursing === true) {
      return ref.promise;
    }

    if (ref.inProgress && ref.refreshing === false) {
      return ref.promise;
    }

    throwIfPendingError(ref);

    const currentDeps = new Map<Cell<AnyCellValue>, AnyCellValue>();
    const getter: CellGetterWithPeek = (cell) => {
      const value = ref.get(cell);
      currentDeps.set(cell, value);
      return value;
    };
    getter.peek = (anCell) => ref.get(anCell);

    const setter: CellSetterWithRecurse = (...args) => {
      try {
        ++ref.inProgress;
        return ref.set(...args);
      } finally {
        --ref.inProgress;
      }
    };
    setter.recurse = (anCell, ...args) => {
      if (ref.fromCleanUp) {
        if (Debug.isDevOrTest() === true) {
          console.warn('Cannot recurse inside cleanup');
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return undefined as any;
      }

      try {
        ref.recursing = true;

        return ref.set(anCell, ...args);
      } finally {
        ref.recursing = false;
        const depsChanged = Array.from(currentDeps).some(
          ([c, v]) => get(c) !== v
        );
        if (depsChanged) {
          ref.refresh();
        }
      }
    };

    ++ref.inProgress;
    const effector = () => {
      try {
        ref.refreshing = false;
        if (ref.mounted === false) {
          return;
        }

        try {
          ref.fromCleanUp = true;
          // @ts-expect-error TS2349
          ref.cleanUp?.();
        } finally {
          ref.fromCleanUp = false;
        }
        ref.cleanUp = this.effect(getter, setter);
      } catch (error) {
        ref.pendingError = error;
        ref.refresh();
      } finally {
        ref.promise = undefined;
        --ref.inProgress;
      }
    };

    return ref.refreshing === true
      ? effector()
      : (ref.promise = Promise.resolve().then(effector));
  });

  protected constructor() {
    super();

    this.refCell.name = `${this.toString()}.Ref`;
    this.initCell.name = `${this.toString()}.Init`;
    this.refreshCell.name = `${this.toString()}.Refresh`;
    this.effectCell.name = `${this.toString()}.Effect`;

    this.initCell.onMount = (mount) => {
      return mount();
    };
  }

  override write() {
    throw new CellIsNotWritableError(this);
  }

  override read(
    getter: CellGetter,
    setter: CellSetter,
    options: CellGetterOptions<SetCell<[SetCellAction<T>], void>>
  ): T {
    getter(this.initCell);
    getter(this.effectCell);

    return this.readEffect(getter, setter, options);
  }

  protected abstract readEffect(
    getter: CellGetter,
    setter: CellSetter,
    _: CellGetterOptions<SetCell<[SetCellAction<T>], void>>
  ): T;

  protected abstract effect(
    getter: CellGetterWithPeek,
    setter: CellSetterWithRecurse
  ): void | CleanupFn;
}
