let previous = new Date();

export const Logger = {
  debug(...parts: any[]) {
    const now = new Date();
    const diff = now.getTime() - previous.getTime();
    previous = now;
    const line = [
      new Date().toISOString(),
      `+${diff}ms`.padStart(8),
      '[debug]',
      ...parts.map(x => {
        if (typeof x === 'string') return x;
        return JSON.stringify(x);
      }),
    ];
    if (process.env.DEBUG) console.log(...line);
  },
};
