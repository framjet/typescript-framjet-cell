export type TaggedObject<T extends object, V extends string = string> = T & {
  [Symbol.toStringTag]: V;
};

export function tagObject<T extends object, V extends string>(
  obj: T,
  tag: V
): TaggedObject<T, V> {
  if (Object.isFrozen(obj)) {
    return obj as TaggedObject<T, V>;
  }

  return Object.assign(obj, { [Symbol.toStringTag]: tag });
}
