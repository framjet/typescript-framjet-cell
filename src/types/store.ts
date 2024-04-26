import { AnyCell, type AnyCellValue, type CellOnUnmount } from '.';

export type AnyCellError = unknown;

export type CellDependencies = Map<AnyCell, CellState>;
export type CellNextDependencies = Map<AnyCell, CellState | undefined>;

export type CellListeners = Set<() => void>;
export type CellDependents = Set<AnyCell>;

export type MountedCells = Set<AnyCell>;

export type CellMountedState = {
  listeners: CellListeners;
  dependents: CellDependents;
  onUnmount?: CellOnUnmount;
};

export type CancelPromise = (next?: Promise<unknown>) => void;

export type CellState<V = AnyCellValue> = {
  dependencies: CellDependencies;
} & ({ error: AnyCellError } | { value: V });
