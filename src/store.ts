/* eslint-disable @typescript-eslint/no-unused-vars */
import { Debug } from '@framjet/common';
import { CellIsNotWritableError } from './errors';
import type {
  AnyCellError,
  CancelPromise,
  Cell,
  CellDependencies,
  CellDependents,
  CellMountedState,
  CellNextDependencies,
  CellState,
  CellWithInitialValue,
  MountedCells,
  WritableCell
} from './types';
import { type AnyCell, type AnyCellValue, type AnyWritableCell, type CellGetter, type CellSetter } from './types';

type PromiseMeta<T> = {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: T;
  reason?: AnyCellError;
  orig?: PromiseLike<T>;
};

export class CellStore {
  static readonly #cancelPromiseMap = new WeakMap<
    Promise<unknown>,
    CancelPromise
  >();

  readonly #name: string | undefined;
  readonly #cellStateMap = new WeakMap<AnyCell, CellState>();
  readonly #mountedMap = new WeakMap<AnyCell, CellMountedState>();
  readonly #pendingStack: Set<AnyCell>[] = [];
  readonly #pendingMap = new WeakMap<
    AnyCell,
    [prevCellState: CellState | undefined, dependents: CellDependents]
  >();
  #mountedCells: MountedCells | undefined;

  constructor(name?: string) {
    this.#name = name;

    if (Debug.isDevOrTest()) {
      this.#mountedCells = new Set<AnyCell>();
    }
  }

  writeCell<V, Args extends unknown[], Result>(
    cell: WritableCell<V, Args, Result>,
    ...args: Args
  ) {
    this.#pendingStack.push(new Set([cell]));
    const result = this.#writeCellState(cell, ...args);
    const flushed = this.#flushPending(this.#pendingStack.pop()!);
    if (Debug.isDevOrTest()) {
      // nop
    }

    return result;
  }

  readCell<V>(cell: Cell<V>): V {
    const cellState = this.#readCellState(cell);

    return this.#returnCellValue(cellState);
  }

  subscribeCell(cell: AnyCell, listener: () => void): () => void {
    const mounted = this.#mountCell(cell);
    const flushed = this.#flushPending([cell]);
    const listeners = mounted.listeners;
    listeners.add(listener);
    if (Debug.isDevOrTest()) {
      // on sub
    }
    return () => {
      listeners.delete(listener);
      this.#tryUnmountCell(cell, mounted);

      if (Debug.isDevOrTest()) {
        // on unsub
      }
    };
  }

  get name(): string | undefined {
    return this.#name;
  }

  toString() {
    return `CellStore${this.#name !== undefined ? `<${this.#name}>` : ''}`;
  }

  get [Symbol.toStringTag]() {
    return this.toString();
  }

  _devGetMountedCells() {
    if (Debug.isDevOrTest() === false) {
      console.warn('This method only available in dev mode');

      return undefined as unknown as IterableIterator<AnyCell>;
    }

    return this.#mountedCells!.values();
  }

  #getCellState<V>(cell: Cell<V>) {
    return this.#cellStateMap.get(cell) as CellState<V> | undefined;
  }

  #setCellState<V>(cell: Cell<V>, cellState: CellState<V>): void {
    if (Debug.isDevOrTest()) {
      Object.freeze(cellState);
    }

    const prevCellState = this.#getCellState<V>(cell);
    this.#cellStateMap.set(cell, cellState);

    if (!this.#pendingMap.has(cell)) {
      this.#pendingStack[this.#pendingStack.length - 1]?.add(cell);
      this.#pendingMap.set(cell, [prevCellState, new Set<AnyCell>()]);
      this.#addPendingDependent(cell, cellState);
    }

    if (this.#hasPromiseCellValue(prevCellState)) {
      const next =
        'value' in cellState
          ? cellState.value instanceof Promise
            ? cellState.value
            : Promise.resolve(cellState.value)
          : Promise.reject(cellState.error);

      if (prevCellState.value !== next) {
        CellStore.#cancelPromise(prevCellState.value, next);
      }
    }
  }

  #setCellValue<V>(
    cell: Cell<V>,
    value: V,
    nextDependencies?: CellNextDependencies,
    keepPreviousDependencies?: boolean
  ): CellState<V> {
    const prevCellState = this.#getCellState(cell);
    const nextCellState: CellState<V> = {
      dependencies: prevCellState?.dependencies || new Map(),
      value
    };

    if (nextDependencies !== undefined) {
      this.#updateDependencies(
        cell,
        nextCellState,
        nextDependencies,
        keepPreviousDependencies
      );
    }

    if (
      this.#isEqualCellValue(prevCellState, nextCellState) &&
      prevCellState.dependencies === nextCellState.dependencies
    ) {
      // bail out
      return prevCellState;
    }

    if (
      this.#hasPromiseCellValue(prevCellState) &&
      this.#hasPromiseCellValue(nextCellState) &&
      this.#isEqualPromiseCellValue(prevCellState, nextCellState)
    ) {
      if (prevCellState.dependencies === nextCellState.dependencies) {
        // bail out
        return prevCellState;
      } else {
        // restore the wrapped promise
        nextCellState.value = prevCellState.value;
      }
    }

    this.#setCellState(cell, nextCellState);

    return nextCellState;
  }

  #setCellValueOrPromise<V>(
    cell: Cell<V>,
    valueOrPromise: V,
    nextDependencies?: CellNextDependencies,
    abortPromise?: () => void
  ): CellState<V> {
    if (this.#isPromiseLike(valueOrPromise)) {
      let continuePromise: (next: Promise<Awaited<V>>) => void;
      const updatePromiseDependencies = () => {
        const prevCellState = this.#getCellState(cell);
        if (
          !this.#hasPromiseCellValue(prevCellState) ||
          prevCellState.value !== promise
        ) {
          // not the latest promise
          return;
        }
        // update dependencies, that could have changed
        const nextCellState = this.#setCellValue(
          cell,
          promise as V,
          nextDependencies
        );

        if (
          this.#mountedMap.has(cell) &&
          nextCellState.dependencies === nextCellState.dependencies
        ) {
          this.#mountDependencies(
            cell,
            nextCellState,
            prevCellState.dependencies
          );
        }
      };
      const promise: Promise<Awaited<V>> & PromiseMeta<Awaited<V>> =
        new Promise((resolve, reject) => {
          let settled = false;
          valueOrPromise.then(
            (v) => {
              if (settled === false) {
                settled = true;
                CellStore.#resolvePromise(promise, v);
                resolve(v as Awaited<V>);
                updatePromiseDependencies();
              }
            },
            (e) => {
              if (settled === false) {
                settled = true;
                CellStore.#rejectPromise(promise, e);
                reject(e);
                updatePromiseDependencies();
              }
            }
          );
          continuePromise = (next) => {
            if (settled === false) {
              settled = true;
              next.then(
                (v) => CellStore.#resolvePromise(promise, v),
                (e) => CellStore.#rejectPromise(promise, e)
              );

              resolve(next);
            }
          };
        });

      promise.orig = valueOrPromise as PromiseLike<Awaited<V>>;
      promise.status = 'pending';

      CellStore.#registerCancelPromise(promise, (next) => {
        if (next !== undefined) {
          continuePromise(next as Promise<Awaited<V>>);
        }
        abortPromise?.();
      });

      return this.#setCellValue(cell, promise as V, nextDependencies, true);
    }

    return this.#setCellValue(cell, valueOrPromise, nextDependencies);
  }

  #setCellError<V>(
    cell: Cell<V>,
    error: AnyCellError,
    nextDependencies?: CellNextDependencies
  ): CellState<V> {
    const prevCellState = this.#getCellState(cell);
    const nextCellState: CellState<V> = {
      dependencies: prevCellState?.dependencies || new Map(),
      error
    };

    if (nextDependencies !== undefined) {
      this.#updateDependencies(cell, nextCellState, nextDependencies);
    }

    if (
      this.#isEqualCellError(prevCellState, nextCellState) &&
      prevCellState.dependencies === nextCellState.dependencies
    ) {
      // bail out
      return prevCellState;
    }

    this.#setCellState(cell, nextCellState);

    return nextCellState;
  }

  #readCellState<V>(cell: Cell<V>, force?: boolean): CellState<V> {
    // See if we can skip recomputing this cell.
    const cellState = this.#getCellState(cell);
    if (!force && cellState !== undefined) {
      // If the cell is mounted, we can use the cache.
      // because it should have been updated by dependencies.
      if (this.#mountedMap.has(cell)) {
        return cellState;
      }

      // Otherwise, check if the dependencies have changed.
      // If all dependencies haven't changed we can use the cache.
      if (
        Array.from(cellState.dependencies).every(([dep, prevDepState]) => {
          if (dep === cell) {
            return true;
          }

          const depState = this.#readCellState(dep);
          // Check if the cell state is unchanged, or
          // check the cell value in case only dependencies ae changed
          return (
            depState === prevDepState ||
            this.#isEqualCellValue(depState, prevDepState)
          );
        })
      ) {
        return cellState;
      }
    }

    // Compute a new state for this cell
    const nextDependencies: CellNextDependencies = new Map();
    let isSync = true;

    const getter = <V>(dep: Cell<V>): V => {
      if (cell.is(dep)) {
        const depState = this.#getCellState(dep);
        if (depState !== undefined) {
          nextDependencies.set(dep, depState);

          return this.#returnCellValue(depState);
        }

        if (this.#hasInitialValue(dep)) {
          nextDependencies.set(dep, undefined);

          return dep.initialValue!;
        }

        // NOTE invalid derived cells can reach here
        throw new Error('no DDomStateCell init');
      }
      // dep !== cell
      const depState = this.#readCellState(dep);
      nextDependencies.set(dep, depState);

      return this.#returnCellValue(depState);
    };

    const setter: CellSetter = <V, Args extends unknown[], R>(
      dep: WritableCell<V, Args, R>,
      ...args: Args
    ): R => {
      const isSync = this.#pendingStack.length > 0;
      if (isSync === false) {
        this.#pendingStack.push(new Set([dep]));
      }
      let result: R | undefined;
      if (cell.is(dep)) {
        if (dep.hasInitialValue() === false) {
          // NOTE technically possible but restricted as it may cause bugs
          throw new Error('DDomStateCell not writable');
        }

        const prevCellState = this.#getCellState(dep);
        const nextCellState = this.#setCellValueOrPromise(dep, args[0] as V);
        if (this.#isEqualCellValue(prevCellState, nextCellState) === false) {
          this.#recomputeDependents(dep);
        }
      } else {
        result = this.#writeCellState(dep, ...args);
      }

      if (isSync === false) {
        const flushed = this.#flushPending(this.#pendingStack.pop()!);
        if (Debug.isDevOrTest()) {
          // dev-listeners
        }
      }

      return result as R;
    };

    let controller: AbortController | undefined;
    let setSelf: ((...args: unknown[]) => unknown) | undefined;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const options = {
      get signal() {
        if (controller === undefined) {
          controller = new AbortController();
        }

        return controller.signal;
      },
      get setSelf() {
        if (
          Debug.isDevOrTest() &&
          self.#isActuallyWritableCell(cell) === false
        ) {
          console.warn('setSelf function cannot be used with read-only cells');
        }
        if (setSelf === undefined && self.#isActuallyWritableCell(cell)) {
          setSelf = (...args) => {
            if (Debug.isDevOrTest() && isSync === true) {
              console.warn('setSelf function cannot bet called in sync');
            }

            if (isSync === false) {
              return self.writeCell(cell, ...args);
            }

            return undefined;
          };
        }

        return setSelf;
      }
    };

    try {
      const valueOrPromise = cell.read(getter, setter, options as never);
      return this.#setCellValueOrPromise(
        cell,
        valueOrPromise,
        nextDependencies,
        () => controller?.abort()
      );
    } catch (error) {
      return this.#setCellError(cell, error, nextDependencies);
    } finally {
      isSync = false;
    }
  }

  #writeCellState<V, Args extends unknown[], Result>(
    cell: WritableCell<V, Args, Result>,
    ...args: Args
  ): Result {
    if (cell.isWritable() === false) {
      throw new CellIsNotWritableError(cell);
    }

    const getter: CellGetter = <V>(dep: Cell<V>) =>
      this.#returnCellValue(this.#readCellState(dep));
    const setter: CellSetter = <V, Args extends unknown[], R>(
      dep: WritableCell<V, Args, R>,
      ...args: Args
    ): R => {
      const isSync = this.#pendingStack.length > 0;
      if (isSync === false) {
        this.#pendingStack.push(new Set([dep]));
      }
      let result: R | undefined;
      if (cell.is(dep)) {
        if (dep.hasInitialValue() === false) {
          // NOTE technically possible but restricted as it may cause bugs
          throw new Error('DDomStateCell not writable');
        }

        const prevCellState = this.#getCellState(dep);
        const nextCellState = this.#setCellValueOrPromise(dep, args[0] as V);
        if (this.#isEqualCellValue(prevCellState, nextCellState) === false) {
          this.#recomputeDependents(dep);
        }
      } else {
        result = this.#writeCellState(dep, ...args);
      }

      if (isSync === false) {
        const flushed = this.#flushPending(this.#pendingStack.pop()!);
        if (Debug.isDevOrTest()) {
          // dev-listeners
        }
      }

      return result as R;
    };

    return cell.write(getter, setter, ...args);
  }

  #recomputeDependents<V>(cell: Cell<V>) {
    const getDependents = (dep: AnyCell): CellDependents => {
      const dependents = new Set(this.#mountedMap.get(dep)?.dependents);
      this.#pendingMap.get(dep)?.[1].forEach((dependent) => {
        dependents.add(dependent);
      });

      return dependents;
    };

    // This is a topological sort via depth-first search, slightly modified from
    // what's described here for simplicity and performance reasons:
    // https://en.wikipedia.org/wiki/Topological_sorting#Depth-first_search

    // Step 1: traverse the dependency graph to build the topSorted cell list
    // We don't bother to check for cycles, which simplifies the algorithm.
    const topSortedCells = new Array<AnyCell>();
    const markedCells = new Set<AnyCell>();
    const visit = (n: AnyCell) => {
      if (markedCells.has(n)) {
        return;
      }
      markedCells.add(n);

      for (const m of getDependents(n)) {
        if (n !== m) {
          visit(m);
        }
      }

      // The algorithm calls for pushing onto the front of the list. For
      // performance, we will simply push onto the end, and then will iterate in
      // reverse order later.
      topSortedCells.push(n);
    };

    // Visit the root cell. This is the only cell in the dependency graph
    // without incoming edges, which is one reason we can simplify the algorithm
    visit(cell);

    // Step 2: use the topSorted cell list to recompute all affected cells
    // Track what's changed, so that we can short circuit when possible
    const changedCells = new Set<AnyCell>([cell]);
    for (let i = topSortedCells.length - 1; i >= 0; --i) {
      const c = topSortedCells[i];
      const prevCellState = this.#getCellState(c);
      if (prevCellState === undefined) {
        continue;
      }

      let hasChangedDeps = false;
      for (const dep of prevCellState.dependencies.keys()) {
        if (dep !== c && changedCells.has(dep)) {
          hasChangedDeps = true;
          break;
        }
      }

      if (hasChangedDeps) {
        const nextCellState = this.#readCellState(c, true);
        if (this.#isEqualCellValue(prevCellState, nextCellState) === false) {
          changedCells.add(c);
        }
      }
    }
  }

  #flushPending(pendingCells: AnyCell[] | Set<AnyCell>): void | Set<AnyCell> {
    let flushed: Set<AnyCell>;
    if (Debug.isDevOrTest()) {
      flushed = new Set();
    }

    const pending: [AnyCell, CellState | undefined][] = [];
    const collectPending = (pendingCell: AnyCell) => {
      if (this.#pendingMap.has(pendingCell) === false) {
        return;
      }

      const [prevCellState, dependents] = this.#pendingMap.get(pendingCell)!;
      this.#pendingMap.delete(pendingCell);
      pending.push([pendingCell, prevCellState]);
      dependents.forEach(collectPending);
      // FIXME might be better if we can avoid collecting from dependencies
      this.#getCellState(pendingCell)?.dependencies.forEach((_, dep) =>
        collectPending(dep)
      );
    };

    pendingCells.forEach(collectPending);
    pending.forEach(([cell, prevCellState]) => {
      const cellState = this.#getCellState(cell);
      if (cellState === undefined) {
        if (Debug.isDevOrTest()) {
          console.warn('[Bug] no DDomStateCell state to flush');
        }

        return;
      }

      if (cellState !== prevCellState) {
        const mounted = this.#mountedMap.get(cell);
        if (mounted && cellState.dependencies != prevCellState?.dependencies) {
          this.#mountDependencies(cell, cellState, prevCellState?.dependencies);
        }

        if (
          mounted &&
          !(
            // TODO This seems pretty hacky. Hope to fix it.
            // Maybe we could `mountDependencies` in `setCellState`?
            (
              this.#hasPromiseCellValue(prevCellState) === false &&
              (this.#isEqualCellValue(prevCellState, cellState) ||
                this.#isEqualCellError(prevCellState, cellState))
            )
          )
        ) {
          mounted.listeners.forEach((listener) => {
            listener();
          });
          if (Debug.isDevOrTest()) {
            flushed.add(cell);
          }
        }
      }
    });
    if (Debug.isDevOrTest()) {
      return flushed;
    }
  }

  #mountCell<V>(
    cell: Cell<V>,
    initialDependent?: AnyCell,
    onMountQueue?: (() => void)[]
  ): CellMountedState {
    const existingMount = this.#mountedMap.get(cell);
    if (existingMount !== undefined) {
      if (initialDependent !== undefined) {
        existingMount.dependents.add(initialDependent);
      }

      return existingMount;
    }

    const queue = onMountQueue || [];
    // mount dependencies before mounting self
    this.#getCellState(cell)?.dependencies.forEach((_, dep) => {
      if (dep !== cell) {
        this.#mountCell(dep, cell, queue);
      }
    });

    // recompute cell state
    this.#readCellState(cell);

    // mount self
    const mounted: CellMountedState = {
      dependents: new Set(initialDependent && [initialDependent]),
      listeners: new Set()
    };

    this.#mountedMap.set(cell, mounted);
    if (Debug.isDevOrTest()) {
      this.#mountedCells?.add(cell);
    }

    // onMount
    if (this.#isActuallyWritableCell(cell) && cell.onMount !== undefined) {
      const { onMount } = cell;
      queue.push(() => {
        const onUnmount = onMount((...args) => this.writeCell(cell, ...args));
        if (onUnmount) {
          mounted.onUnmount = onUnmount;
        }
      });
    }

    if (!onMountQueue) {
      queue.forEach((f) => f());
    }

    return mounted;
  }

  #mountDependencies<V>(
    cell: Cell<V>,
    cellState: CellState<V>,
    prevDependencies?: CellDependencies
  ): void {
    const depSet = new Set(cellState.dependencies.keys());
    const maybeUnmountCellSet = new Set<AnyCell>();

    prevDependencies?.forEach((_, dep) => {
      if (depSet.has(dep)) {
        // not changed
        depSet.delete(dep);
        return;
      }

      maybeUnmountCellSet.add(dep);
      const mounted = this.#mountedMap.get(dep);
      if (mounted !== undefined) {
        mounted.dependents.delete(cell); // delete from dependents
      }
    });

    depSet.forEach((dep) => {
      this.#mountCell(dep, cell);
    });

    maybeUnmountCellSet.forEach((dep) => {
      const mounted = this.#mountedMap.get(dep);
      if (mounted) {
        this.#tryUnmountCell(dep, mounted);
      }
    });
  }

  #updateDependencies<V>(
    cell: Cell<V>,
    nextCellState: CellState<V>,
    nextDependencies: CellNextDependencies,
    keepPreviousDependencies?: boolean
  ): void {
    const dependencies: CellDependencies = new Map(
      keepPreviousDependencies ? nextCellState.dependencies : null
    );

    let changed = false;
    nextDependencies.forEach((depState, dep) => {
      if (!depState && cell.is(dep)) {
        depState = nextCellState;
      }

      if (depState) {
        dependencies.set(dep, depState);
        if (nextCellState.dependencies.get(dep) !== depState) {
          changed = true;
        }
      } else if (Debug.isDevOrTest()) {
        console.warn('[Bug] DDomStateCell state not found');
      }
    });

    if (changed || nextCellState.dependencies.size !== dependencies.size) {
      nextCellState.dependencies = dependencies;
    }
  }

  #addPendingDependent(cell: AnyCell, cellState: CellState) {
    cellState.dependencies.forEach((_, dependencyCell) => {
      if (!this.#pendingMap.has(dependencyCell)) {
        const dependencyCellState = this.#getCellState(dependencyCell);

        this.#pendingStack[this.#pendingStack.length - 1]?.add(dependencyCell);
        this.#pendingMap.set(dependencyCell, [dependencyCellState, new Set()]);

        if (dependencyCellState !== undefined) {
          this.#addPendingDependent(dependencyCell, dependencyCellState);
        }
      }

      this.#pendingMap.get(dependencyCell)![1].add(cell);
    });
  }

  // FIXME doesn't work with mutually dependent cells
  #canUnmountCell(cell: AnyCell, mounted: CellMountedState) {
    return (
      !mounted.listeners.size &&
      (!mounted.dependents.size ||
        (mounted.dependents.size === 1 && mounted.dependents.has(cell)))
    );
  }

  #tryUnmountCell<V>(cell: Cell<V>, mounted: CellMountedState): void {
    if (!this.#canUnmountCell(cell, mounted)) {
      return;
    }

    // unmount self
    const onUnmount = mounted.onUnmount;
    if (onUnmount !== undefined) {
      onUnmount();
    }

    this.#mountedMap.delete(cell);
    if (Debug.isDevOrTest()) {
      this.#mountedCells?.delete(cell);
    }

    // unmount dependencies afterward
    const cellState = this.#getCellState(cell);
    if (cellState !== undefined) {
      // cancel promise
      if (this.#hasPromiseCellValue(cellState)) {
        CellStore.#cancelPromise(cellState.value);
      }

      cellState.dependencies.forEach((_, dep) => {
        if (dep !== cell) {
          const mountedDep = this.#mountedMap.get(dep);
          if (mountedDep !== undefined) {
            mountedDep.dependents.delete(cell);

            this.#tryUnmountCell(dep, mountedDep);
          }
        }
      });
    } else if (Debug.isDevOrTest()) {
      console.warn('[Byg] could not find DDomStateCell state to unmount', cell);
    }
  }

  #isEqualCellValue<V>(
    left: CellState<V> | undefined,
    right: CellState<V>
  ): left is CellState<V> {
    return (
      !!left &&
      'value' in left &&
      'value' in right &&
      Object.is(left.value, right.value)
    );
  }

  #isEqualCellError<V>(
    left: CellState<V> | undefined,
    right: CellState<V>
  ): left is CellState<V> {
    return (
      !!left &&
      'error' in left &&
      'error' in right &&
      Object.is(left.error, right.error)
    );
  }

  #hasPromiseCellValue<V>(
    cell: CellState<V> | undefined
  ): cell is CellState<V> & { value: V & Promise<unknown> } {
    return !!cell && 'value' in cell && cell.value instanceof Promise;
  }

  #isEqualPromiseCellValue<V>(
    left: CellState<Promise<V> & PromiseMeta<V>>,
    right: CellState<Promise<V> & PromiseMeta<V>>
  ) {
    return (
      'value' in left &&
      'value' in right &&
      left.value.orig &&
      left.value.orig === right.value.orig
    );
  }

  #isPromiseLike(input: unknown): input is PromiseLike<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return typeof (input as any)?.then === 'function';
  }

  #isActuallyWritableCell(cell: AnyCell): cell is AnyWritableCell {
    return cell.isWritable();
  }

  #hasInitialValue<T extends Cell<AnyCellValue>>(
    cell: T
  ): cell is T &
    (T extends Cell<infer Value> ? CellWithInitialValue<Value> : never) {
    return cell.hasInitialValue();
  }

  #returnCellValue<V>(cellState: CellState<V>): V {
    if ('error' in cellState) {
      throw cellState.error;
    }

    return cellState.value;
  }

  static #registerCancelPromise(
    promise: Promise<unknown>,
    cancel: CancelPromise
  ) {
    CellStore.#cancelPromiseMap.set(promise, cancel);
    promise
      .catch(() => {
        // nop
      })
      .finally(() => CellStore.#cancelPromiseMap.delete(promise));
  }

  static #cancelPromise(promise: Promise<unknown>, next?: Promise<unknown>) {
    const cancel = CellStore.#cancelPromiseMap.get(promise);

    if (cancel !== undefined) {
      CellStore.#cancelPromiseMap.delete(promise);
      cancel(next);
    }
  }

  static #resolvePromise<T>(promise: Promise<T> & PromiseMeta<T>, value: T) {
    promise.status = 'fulfilled';
    promise.value = value;
  }

  static #rejectPromise<T>(
    promise: Promise<T> & PromiseMeta<T>,
    reason: AnyCellError
  ) {
    promise.status = 'rejected';
    promise.reason = reason;
  }
}


let defaultCellStore: CellStore | undefined;

export function getDefaultStore(): CellStore {
  if (defaultCellStore === undefined) {
    defaultCellStore = new CellStore('default');
    if (Debug.isDevOrTest()) {
      globalThis.__CELL_DEFAULT_STORE__ ||= defaultCellStore;
      if (globalThis.__CELL_DEFAULT_STORE__ !== defaultCellStore) {
        console.warn(
          'Detected multiple FramJet CellStore instances. It may cause unexpected behavior with the default store.'
        );
      }
    }
  }
  return defaultCellStore;
}

declare global {
  // eslint-disable-next-line no-var
  var __CELL_DEFAULT_STORE__: CellStore | undefined;
}
