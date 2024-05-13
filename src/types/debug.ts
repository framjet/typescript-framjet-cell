import type { AnyCell, AnyWritableCell } from '@framjet-cell/source';

export interface BaseCellDebugAction {
  readonly type: string;

}

export interface WriteCellDebugAction extends BaseCellDebugAction {
  readonly type: 'write';
  readonly to: AnyWritableCell;
  readonly flushed: Set<AnyCell>;
}

export interface WriteAsyncCellDebugAction extends BaseCellDebugAction {
  readonly type: 'write.async';
  readonly flushed: Set<AnyCell>;
}

export interface SubCellDebugAction extends BaseCellDebugAction {
  readonly type: 'sub';
  readonly flushed: Set<AnyCell>;
}

export interface UnSubCellDebugAction extends BaseCellDebugAction {
  readonly type: 'unsub';
}

export interface RestoreCellDebugAction extends BaseCellDebugAction {
  readonly type: 'restore';
  readonly flushed: Set<AnyCell>;
}

export interface MountDependencyCellDebugAction extends BaseCellDebugAction {
  readonly type: 'mount';
  readonly cell: AnyCell;
  readonly dependent: AnyCell;
}

export interface NewDependencyCellDebugAction extends BaseCellDebugAction {
  readonly type: 'dep';
  readonly from: AnyCell;
  readonly to: AnyCell;
}

export type CellDebugAction =
  | WriteCellDebugAction
  | WriteAsyncCellDebugAction
  | SubCellDebugAction
  | UnSubCellDebugAction
  | RestoreCellDebugAction
  | MountDependencyCellDebugAction
  | NewDependencyCellDebugAction
  ;

export interface CellDebugListener {
  name: string;
  onAction: (action: CellDebugAction) => void;
}

export type CellDebugListeners = Set<CellDebugListener>;
