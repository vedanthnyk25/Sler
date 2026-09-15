export class QueueFullError extends Error {
  constructor() {
    super('Too many requests. Please wait before submitting more.');
    this.name = 'QueueFullError';
  }
}

export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit is open. Please wait before submitting more requests.');
    this.name = 'CircuitOpenError';
  }
}
