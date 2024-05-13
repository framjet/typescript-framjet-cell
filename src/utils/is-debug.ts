/// <reference types="vite/client" />

export function isDev() {
  return import.meta.env?.MODE === 'development' || import.meta.env?.MODE === 'test';
}

