# FramJet Cell

A powerful and flexible state management library for JavaScript and TypeScript applications, providing a reactive and composable way to manage state using cells and a robust store implementation. Heavily inspired by the `jotai` library and its concept of atoms, `@framjet/cell` takes a different approach by leveraging classes to implement cells. It is specifically designed to be used in `FramJet` projects, offering seamless integration and enhanced state management capabilities.

## Installation

You can install `@framjet/cell` using your preferred package manager:

npm:
```bash
npm install @framjet/cell
```

Yarn:
```bash
yarn add @framjet/cell
```

pnpm:
```bash
pnpm add @framjet/cell
```

## Usage

### Creating Cells

`@framjet/cell` provides a `cell` function to create different types of cells:

```typescript
import { cell } from '@framjet/cell';

// Create a primitive cell with an initial value
const countCell = cell(0);

// Create a read-only derived cell
const doubleCountCell = cell((get) => get(countCell) * 2);

// Create a writable derived cell
const incrementCell = cell(
  (get) => get(countCell),
  (get, set) => set(countCell, get(countCell) + 1)
);
```

### Using the Store

The `DDomStateCellStore` class provides a store implementation to manage and interact with cells:

```typescript
import { DDomStateCellStore } from '@framjet/cell';

const store = new DDomStateCellStore();

// Read a cell value
const count = store.readCell(countCell);

// Write to a cell
store.writeCell(countCell, 5);

// Subscribe to a cell
const unsubscribe = store.subscribeCell(countCell, () => {
  console.log('Count changed:', store.readCell(countCell));
});
```

### Available Cell Types

`@framjet/cell` provides the following cell types:

- `PrimitiveCell`: Represents a cell with a primitive value.
- `CalculatedCell`: Represents a read-only derived cell.
- `CalculatedWritableCell`: Represents a writable derived cell.
- `EffectCell`: Represents a cell that performs side effects.
- `LazyCell`: Represents a lazily evaluated cell.

## Simple Application Usage

Here's a simple example of using `@framjet/cell` in an application:

```typescript
import { cell, DDomStateCellStore } from '@framjet/cell';

// Create cells
const countCell = cell(0);
const doubleCountCell = cell((get) => get(countCell) * 2);
const incrementCell = cell(
  (get) => get(countCell),
  (get, set) => set(countCell, get(countCell) + 1)
);

// Create a store
const store = new DDomStateCellStore();

// Subscribe to cells
store.subscribeCell(doubleCountCell, () => {
  console.log('Double count:', store.readCell(doubleCountCell));
});

// Increment the count
store.writeCell(incrementCell);
// Output: Double count: 2

store.writeCell(incrementCell);
// Output: Double count: 4
```

This example demonstrates how to create cells, use a store to manage them, and interact with the cells by reading values, writing values, and subscribing to changes.

For more advanced usage and detailed API documentation, please refer to the library's documentation.

## Contributing

Contributions to `@framjet/cell` are welcome! If you encounter any issues or have suggestions for improvements, please feel free to submit a pull request or open an issue on the project's repository.

## License
This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

