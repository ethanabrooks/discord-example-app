export function randomChoice<Type>(array: Type[]) {
  return array[Math.floor(Math.random() * array.length)];
}

export function randomBoolean() {
  return Math.random() < 0.5;
}
