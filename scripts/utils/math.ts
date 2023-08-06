export function randomChoice<Type>(array: Type[]) {
  return array[Math.floor(Math.random() * array.length)];
}

export function randomNumber(n: number) {
  return Math.round(Math.random() * n);
}

export function randomBoolean() {
  return Math.random() < 0.5;
}
