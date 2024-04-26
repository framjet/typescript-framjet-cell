/* eslint-disable @typescript-eslint/no-empty-function */
import { waitFor } from '@testing-library/dom';
import { assert, expect, it, vi } from 'vitest';
import {
  type AnyWritableCell,
  CalculatedWritableCell,
  cell,
  CellGetter,
  LazyCell,
  PrimitiveCell
} from '.';
import { CellStore } from './store';

const createStore = () => new CellStore();

it('should not fire on subscribe', async () => {
  const store = createStore();
  const countCell = cell(0);
  const callback1 = vi.fn();
  const callback2 = vi.fn();
  store.subscribeCell(countCell, callback1);
  store.subscribeCell(countCell, callback2);
  expect(callback1).not.toHaveBeenCalled();
  expect(callback2).not.toHaveBeenCalled();
});

it('should not fire subscription if primitive cell value is the same', async () => {
  const store = createStore();
  const countCell = cell(0);
  const callback = vi.fn();
  store.subscribeCell(countCell, callback);
  const calledTimes = callback.mock.calls.length;
  store.writeCell(countCell, 0);
  expect(callback).toHaveBeenCalledTimes(calledTimes);
});

it('should not fire subscription if derived cell value is the same', async () => {
  const store = createStore();
  const countCell = cell(0);
  const derivedCell = cell((get) => get(countCell) * 0);
  const callback = vi.fn();
  store.subscribeCell(derivedCell, callback);
  const calledTimes = callback.mock.calls.length;
  store.writeCell(countCell, 1);
  expect(callback).toHaveBeenCalledTimes(calledTimes);
});

it('should unmount with store.readCell', async () => {
  const store = createStore();
  const countCell = cell(0);
  const callback = vi.fn();
  const unsub = store.subscribeCell(countCell, callback);
  store.readCell(countCell);
  unsub();
  const result = Array.from(store._devGetMountedCells() ?? []);
  expect(result).toEqual([]);
});

it('should unmount dependencies with store.readCell', async () => {
  const store = createStore();
  const countCell = cell(0);
  const derivedCell = cell((get) => get(countCell) * 2);
  const callback = vi.fn();
  const unsub = store.subscribeCell(derivedCell, callback);
  store.readCell(derivedCell);
  unsub();
  const result = Array.from(store._devGetMountedCells() ?? []);
  expect(result).toEqual([]);
});

it('should update async cell with delay (#1813)', async () => {
  const countCell = cell(0);

  const resolve: (() => void)[] = [];
  const delayedCell = cell(async (get) => {
    const count = get(countCell);
    await new Promise<void>((r) => resolve.push(r));
    return count;
  });

  const store = createStore();
  store.readCell(delayedCell);
  store.writeCell(countCell, 1);
  resolve.splice(0).forEach((fn) => fn());
  await new Promise<void>((r) => setTimeout(r)); // wait for a tick
  const promise = store.readCell(delayedCell);
  resolve.splice(0).forEach((fn) => fn());
  expect(await promise).toBe(1);
});

it('should override a promise by setting', async () => {
  const store = createStore();
  const countCell = cell(Promise.resolve(0));
  const infinitePending = new Promise<never>(() => {});
  store.writeCell(countCell, infinitePending);
  const promise = store.readCell(countCell);
  store.writeCell(countCell, Promise.resolve(1));
  expect(await promise).toBe(1);
});

it('should update async cell with deps after await (#1905)', async () => {
  const countCell = cell(0);
  const resolve: (() => void)[] = [];
  const delayedCell = cell(async (get) => {
    await new Promise<void>((r) => resolve.push(r));
    const count = get(countCell);
    return count;
  });
  const derivedCell = cell(async (get) => {
    const count = await get(delayedCell);
    return count;
  });

  const store = createStore();
  let lastValue = store.readCell(derivedCell);
  const unsub = store.subscribeCell(derivedCell, () => {
    lastValue = store.readCell(derivedCell);
  });
  store.writeCell(countCell, 1);
  resolve.splice(0).forEach((fn) => fn());
  expect(await lastValue).toBe(1);
  store.writeCell(countCell, 2);
  resolve.splice(0).forEach((fn) => fn());
  expect(await lastValue).toBe(2);
  store.writeCell(countCell, 3);
  resolve.splice(0).forEach((fn) => fn());
  expect(await lastValue).toBe(3);
  unsub();
});

it('should not fire subscription when async cell promise is the same', async () => {
  const promise = Promise.resolve();
  const promiseCell = cell(promise);
  const derivedGetter = vi.fn((get: CellGetter) => get(promiseCell));
  const derivedCell = cell(derivedGetter);

  const store = createStore();

  expect(derivedGetter).not.toHaveBeenCalled();

  const promiseListener = vi.fn();
  const promiseUnsub = store.subscribeCell(promiseCell, promiseListener);
  const derivedListener = vi.fn();
  const derivedUnsub = store.subscribeCell(derivedCell, derivedListener);

  expect(derivedGetter).toHaveBeenCalledOnce();
  expect(promiseListener).not.toHaveBeenCalled();
  expect(derivedListener).not.toHaveBeenCalled();

  store.readCell(promiseCell);
  store.readCell(derivedCell);

  expect(derivedGetter).toHaveBeenCalledOnce();
  expect(promiseListener).not.toHaveBeenCalled();
  expect(derivedListener).not.toHaveBeenCalled();

  store.writeCell(promiseCell, promise);

  expect(derivedGetter).toHaveBeenCalledOnce();
  expect(promiseListener).not.toHaveBeenCalled();
  expect(derivedListener).not.toHaveBeenCalled();

  store.writeCell(promiseCell, promise);

  expect(derivedGetter).toHaveBeenCalledOnce();
  expect(promiseListener).not.toHaveBeenCalled();
  expect(derivedListener).not.toHaveBeenCalled();

  promiseUnsub();
  derivedUnsub();
});

it('should notify subscription with tree dependencies (#1956)', async () => {
  const valueCell = cell(1);
  const dep1Cell = cell((get) => get(valueCell) * 2);
  const dep2Cell = cell((get) => get(valueCell) + get(dep1Cell));
  const dep3Cell = cell((get) => get(dep1Cell));

  const cb = vi.fn();
  const store = createStore();
  store.subscribeCell(dep2Cell, vi.fn()); // this will cause the bug
  store.subscribeCell(dep3Cell, cb);

  expect(cb).toBeCalledTimes(0);
  expect(store.readCell(dep3Cell)).toBe(2);
  store.writeCell(valueCell, (c: number) => c + 1);
  expect(cb).toBeCalledTimes(1);
  expect(store.readCell(dep3Cell)).toBe(4);
});

it('should notify subscription with tree dependencies with bail-out', async () => {
  const valueCell = cell(1);
  const dep1Cell = cell((get) => get(valueCell) * 2);
  const dep2Cell = cell((get) => get(valueCell) * 0);
  const dep3Cell = cell((get) => get(dep1Cell) + get(dep2Cell));

  const cb = vi.fn();
  const store = createStore();
  store.subscribeCell(dep1Cell, vi.fn());
  store.subscribeCell(dep3Cell, cb);

  expect(cb).toBeCalledTimes(0);
  expect(store.readCell(dep3Cell)).toBe(2);
  store.writeCell(valueCell, (c: number) => c + 1);
  expect(cb).toBeCalledTimes(1);
  expect(store.readCell(dep3Cell)).toBe(4);
});

it('should bail out with the same value with chained dependency (#2014)', async () => {
  const store = createStore();
  const objCell = cell({ count: 1 });
  const countCell = cell((get) => get(objCell).count);
  const deriveFn = vi.fn((get: CellGetter) => get(countCell));
  const derivedCell = cell(deriveFn);
  const deriveFurtherFn = vi.fn((get: CellGetter) => {
    get(objCell); // intentional extra dependency
    return get(derivedCell);
  });
  const derivedFurtherCell = cell(deriveFurtherFn);
  const callback = vi.fn();
  store.subscribeCell(derivedFurtherCell, callback);
  expect(store.readCell(derivedCell)).toBe(1);
  expect(store.readCell(derivedFurtherCell)).toBe(1);
  expect(callback).toHaveBeenCalledTimes(0);
  expect(deriveFn).toHaveBeenCalledTimes(1);
  expect(deriveFurtherFn).toHaveBeenCalledTimes(1);
  store.writeCell(objCell, (obj) => ({ ...obj }));
  expect(callback).toHaveBeenCalledTimes(0);
  expect(deriveFn).toHaveBeenCalledTimes(1);
  expect(deriveFurtherFn).toHaveBeenCalledTimes(2);
});

it('should not call read function for unmounted cells (#2076)', async () => {
  const store = createStore();
  const countCell = cell(1);
  const derive1Fn = vi.fn((get: CellGetter) => get(countCell));
  const derived1Cell = cell(derive1Fn);
  const derive2Fn = vi.fn((get: CellGetter) => get(countCell));
  const derived2Cell = cell(derive2Fn);
  expect(store.readCell(derived1Cell)).toBe(1);
  expect(store.readCell(derived2Cell)).toBe(1);
  expect(derive1Fn).toHaveBeenCalledTimes(1);
  expect(derive2Fn).toHaveBeenCalledTimes(1);
  store.subscribeCell(derived2Cell, vi.fn());
  store.writeCell(countCell, (c: number) => c + 1);
  expect(derive1Fn).toHaveBeenCalledTimes(1);
  expect(derive2Fn).toHaveBeenCalledTimes(2);
});

it('should update with conditional dependencies (#2084)', async () => {
  const store = createStore();
  const f1 = cell(false);
  const f2 = cell(false);
  const f3 = cell(
    (get) => get(f1) && get(f2),
    (_get, set, val) => {
      set(f1, val);
      set(f2, val);
    },
  );
  store.subscribeCell(f1, vi.fn());
  store.subscribeCell(f2, vi.fn());
  store.subscribeCell(f3, vi.fn());
  store.writeCell(f3, true);
  expect(store.readCell(f3)).toBe(true);
});

it("should recompute dependents' state after onMount (#2098)", async () => {
  const store = createStore();

  const condCell = cell(false);
  const baseCell = cell(false);
  baseCell.onMount = (set) => set(true);
  const derivedCell = cell(
    (get) => get(baseCell),
    (_get, set, update) => set(baseCell, update),
  );
  const finalCell = cell(
    (get) => (get(condCell) ? get(derivedCell) : undefined),
    (_get, set, value) => set(derivedCell, value),
  );

  store.subscribeCell(finalCell, () => {}); // mounts finalCell, but not baseCell
  expect(store.readCell(baseCell)).toBe(false);
  expect(store.readCell(derivedCell)).toBe(false);
  expect(store.readCell(finalCell)).toBe(undefined);

  store.writeCell(condCell, true); // mounts baseCell
  expect(store.readCell(baseCell)).toBe(true);
  expect(store.readCell(derivedCell)).toBe(true);
  expect(store.readCell(finalCell)).toBe(true);

  store.writeCell(finalCell, false);
  expect(store.readCell(baseCell)).toBe(false);
  expect(store.readCell(derivedCell)).toBe(false);
  expect(store.readCell(finalCell)).toBe(false);
});

it('should update derived cells during write (#2107)', async () => {
  const store = createStore();

  const baseCountCell = cell(1);
  const countCell = cell(
    (get) => get(baseCountCell),
    (get, set, newValue) => {
      set(baseCountCell, newValue);
      if (get(countCell) !== newValue) {
        throw new Error('mismatch');
      }
    },
  );

  store.subscribeCell(countCell, () => {});
  expect(store.readCell(countCell)).toBe(1);
  store.writeCell(countCell, 2);
  expect(store.readCell(countCell)).toBe(2);
});

it('resolves dependencies reliably after a delay (#2192)', async () => {
  expect.assertions(1);
  const countCell = cell(0);
  let result: number | null = null;

  const resolve: (() => void)[] = [];
  const asyncCell = cell(async (get) => {
    const count = get(countCell);
    await new Promise<void>((r) => resolve.push(r));
    return count;
  });

  const derivedCell = cell(
    async (get, _, { setSelf }) => {
      get(countCell);
      await Promise.resolve();
      result = await get(asyncCell);
      if (result === 2) setSelf(); // <-- necessary
    },
    () => {},
  );

  const store = createStore();
  store.subscribeCell(derivedCell, () => {});

  await waitFor(() => {
    assert(resolve.length === 1);
  });

  resolve[0]!();
  const increment = (c: number) => c + 1;
  store.writeCell(countCell, increment);
  store.writeCell(countCell, increment);

  await waitFor(() => assert(resolve.length === 3));

  resolve[1]!();
  resolve[2]!();
  await waitFor(() => assert(result === 2));

  store.writeCell(countCell, increment);
  store.writeCell(countCell, increment);

  await waitFor(() => assert(resolve.length === 5));

  resolve[3]!();
  resolve[4]!();

  await new Promise(setImmediate);
  await waitFor(() => assert(store.readCell(countCell) === 4));

  expect(result).toBe(4); // 3
});

it('should not recompute a derived cell value if unchanged (#2168)', async () => {
  const store = createStore();
  const countCell = cell(1);
  const derived1Cell = cell((get) => get(countCell) * 0);
  const derive2Fn = vi.fn((get: CellGetter) => get(derived1Cell));
  const derived2Cell = cell(derive2Fn);
  expect(store.readCell(derived2Cell)).toBe(0);
  store.writeCell(countCell, (c: number) => c + 1);
  expect(store.readCell(derived2Cell)).toBe(0);
  expect(derive2Fn).toHaveBeenCalledTimes(1);
});

it('should mount once with cell creator cell (#2314)', async () => {
  const countCell = cell(1);
  countCell.onMount = vi.fn((setCell: (v: number) => void) => {
    setCell(2);
  });
  const cellCreatorCell = cell((get) => {
    const derivedCell = cell((get) => {
      return get(countCell);
    });
    get(derivedCell);
  });
  const store = createStore();
  store.subscribeCell(cellCreatorCell, () => {});
  expect(countCell.onMount).toHaveBeenCalledTimes(1);
});

it('should flush pending write triggered asynchronously and indirectly (#2451)', async () => {
  const store = createStore();
  const anCell = cell('initial');
  anCell.name = 'InitialValue';

  const callbackFn = vi.fn((_value: string) => {});
  const unsub = store.subscribeCell(anCell, () => {
    callbackFn(store.readCell(anCell));
  });

  const actionCell = cell(null, async (_get, set) => {
    await Promise.resolve(); // waiting a microtask
    set(indirectSetCell);
  });
  actionCell.name = 'actionCell';

  const indirectSetCell = cell(null, (_get, set) => {
    set(anCell, 'next');
  });
  indirectSetCell.name = 'indirectCell';

  // executing the chain reaction
  await store.writeCell(actionCell);

  expect(callbackFn).toHaveBeenCalledOnce();
  expect(callbackFn).toHaveBeenCalledWith('next');
  unsub();
});

it('should throw error when trying to write into not writable cell', () => {
  const store = createStore();

  expect(() => store.writeCell(cell(() => {}) as AnyWritableCell)).toThrowError(
    /The cell CalculatedWritableCell:Cell<\d+> is not writable type/,
  );
});

it('should allow set value of another atom inside read of atom', () => {
  const store = createStore();

  const storageCell = cell(undefined) as PrimitiveCell<number | undefined>;
  const actionCell = cell((get) => {
    const number = get(storageCell);

    if (number === undefined) {
      store.writeCell(storageCell, 1234);

      return get(storageCell);
    }

    return number;
  });

  store.subscribeCell(actionCell, () => {
    console.log('ran');
  });

  store.readCell(actionCell);
});

it('should call write on mount', () => {
  const store = createStore();
  const callbackFn = vi.fn((_value: string) => {});

  const writeOnlyCell = cell(
    () => 'dd',
    async (_get, set) => {
      callbackFn('works');
    },
  );

  writeOnlyCell.onMount = (mounted) => {
    mounted();
  };

  const initCell = cell((get) => get(writeOnlyCell));

  // store.readCell(initCell);
  store.subscribeCell(initCell, () => {});

  expect(callbackFn).toHaveBeenCalledOnce();
  expect(callbackFn).toHaveBeenCalledWith('works');
});

it('should call lazy cell provider once', () => {
  const store = createStore();
  const callbackFn = vi.fn((_value: string) => {});

  const valueCell = cell('foo');

  const lazyCell = new LazyCell((get, set) => {
    callbackFn('works');

    return valueCell;
  });

  expect(store.readCell(lazyCell)).toBe('foo');

  store.writeCell(valueCell, 'bar');

  expect(store.readCell(lazyCell)).toBe('bar');

  expect(callbackFn).toHaveBeenCalledOnce();
  expect(callbackFn).toHaveBeenCalledWith('works');
});
